"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createR2Client, r2ConfigFromEnv } from "../lib/r2";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { runWithConcurrency } from "../lib/concurrency";
import { WATER_LEVELS_KEY } from "../lib/syncKeys";
import { cameraImageKey, IMAGE_CACHE_CONTROL } from "./snapshotBuilder";

export const CCTV_BASE_URL = "http://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image";

/**
 * Mirrors JPS CCTV frames to R2 as cam/{jpsCameraId}.jpg so the camera pages
 * never hit JPS live. Failed cameras keep their previous frame on R2.
 * Budget: "all" every 15 min ≈ 262k PUTs/month; "alert" every 5 min for the few elevated stations.
 * Skipped entirely while the water-level sync has JPS marked unreachable, and
 * aborted after MAX_CONSECUTIVE_FAILURES so an outage can't burn action compute.
 */
const MAX_CONSECUTIVE_FAILURES = 10;

export const syncCameraImages = internalAction({
    args: { tier: v.union(v.literal("all"), v.literal("alert")) },
    handler: async (ctx, { tier }): Promise<{ attempted: number; uploaded: number }> => {
        const state = await ctx.runQuery(internal.syncState.get, { key: WATER_LEVELS_KEY });
        if (state?.lastStatus === "upstream_error") {
            console.warn("JPS marked unreachable by the water-level sync; skipping camera mirror");
            return { attempted: 0, uploaded: 0 };
        }

        const cameras = await ctx.runQuery(internal.cameras.listForImageSync, { tier });
        if (cameras.length === 0) return { attempted: 0, uploaded: 0 };

        const r2 = createR2Client(r2ConfigFromEnv(process.env));
        let uploaded = 0;
        let consecutiveFailures = 0;

        await runWithConcurrency(cameras, 5, async (camera) => {
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return;
            try {
                const response = await fetchWithRetry(`${CCTV_BASE_URL}/${camera.jpsCameraId}.jpg`, {
                    timeoutMs: 5_000,
                    retries: 0,
                });
                const contentType = response.headers.get("content-type") ?? "";
                if (!contentType.startsWith("image/")) {
                    consecutiveFailures += 1;
                    console.warn(`camera ${camera.jpsCameraId}: unexpected content-type "${contentType}"`);
                    return;
                }
                const body = new Uint8Array(await response.arrayBuffer());
                if (body.byteLength === 0) {
                    consecutiveFailures += 1;
                    console.warn(`camera ${camera.jpsCameraId}: empty body`);
                    return;
                }
                await r2.putObject(cameraImageKey(camera.jpsCameraId), body, {
                    contentType: "image/jpeg",
                    cacheControl: IMAGE_CACHE_CONTROL,
                });
                await ctx.runMutation(internal.cameras.setLastImageAt, {
                    cameraId: camera._id,
                    capturedAt: new Date().toISOString(),
                });
                uploaded += 1;
                consecutiveFailures = 0;
            } catch (error) {
                consecutiveFailures += 1;
                console.warn(`camera ${camera.jpsCameraId}: ${error instanceof Error ? error.message : String(error)}`);
            }
        });

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.error(`camera sync aborted after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
        }

        // Re-publish JSON so captured_at is current for the UI captions.
        if (uploaded > 0) {
            try {
                await ctx.runAction(internal.sync.snapshotPublisher.publishSnapshot, { includeData: true });
            } catch (error) {
                console.error("Snapshot publish after camera sync failed:", error);
            }
        }

        console.debug(`📷 Camera sync (${tier}): ${uploaded}/${cameras.length} uploaded`);
        return { attempted: cameras.length, uploaded };
    },
});
