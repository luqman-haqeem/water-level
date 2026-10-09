"use node";

import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import { createR2Client, r2ConfigFromEnv } from "../lib/r2";
import { WATER_LEVELS_KEY } from "../lib/syncKeys";
import {
    buildDataFiles,
    buildMetaFile,
    JSON_CACHE_CONTROL,
    metaFromSyncState,
} from "./snapshotBuilder";

const JSON_PUT = { contentType: "application/json", cacheControl: JSON_CACHE_CONTROL };

/**
 * Uploads the public snapshot to R2.
 * - includeData=true: trends.json, cameras.json, stations.json, then meta.json.
 * - includeData=false: meta.json only (attempt/status heartbeat).
 * syncState is read *before* the data queries and meta.json is uploaded last,
 * so meta can only ever describe a sync at or older than the data beside it —
 * never one the data hasn't caught up with.
 * Runs in the Node runtime so aws4fetch + WebCrypto are guaranteed.
 */
export const publishSnapshot = internalAction({
    args: { includeData: v.boolean() },
    handler: async (ctx, { includeData }): Promise<{ uploaded: string[] }> => {
        const r2 = createR2Client(r2ConfigFromEnv(process.env));
        const generatedAt = new Date().toISOString();
        const uploaded: string[] = [];

        // Read first: a sync that lands while we upload must not be described
        // by this meta.json, or it would advertise data we never published.
        const state = await ctx.runQuery(internal.syncState.get, { key: WATER_LEVELS_KEY });

        if (includeData) {
            const [stations, cameras, trends] = await Promise.all([
                ctx.runQuery(api.stations.getStationsWithDetails, {}),
                ctx.runQuery(api.cameras.getCamerasWithDetails, {}),
                ctx.runQuery(internal.waterLevelHistory.getAllTrends, {}),
            ]);
            for (const file of buildDataFiles({ stations, cameras, trends, generatedAt })) {
                await r2.putObject(file.key, file.body, JSON_PUT);
                uploaded.push(file.key);
            }
        }

        const meta = buildMetaFile(metaFromSyncState(state, generatedAt));
        await r2.putObject(meta.key, meta.body, JSON_PUT);
        uploaded.push(meta.key);

        console.debug(`📤 Snapshot published: ${uploaded.join(", ")}`);
        return { uploaded };
    },
});
