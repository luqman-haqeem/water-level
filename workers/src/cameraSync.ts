import {
    IMAGE_CACHE_CONTROL,
    JSON_CACHE_CONTROL,
    SNAPSHOT_KEYS,
    cameraImageKey,
    fetchWithRetry,
} from "./shared";
import { readSyncState } from "./syncState";
import type { RetryOverrides } from "./jps";

// HTTPS, never http. Over cleartext a network attacker could substitute the frames we
// mirror and then serve from our own domain. Phase 0 saw https 522 once and http
// succeed, but that was JPS flakiness, not TLS — the answer is to retry, not downgrade.
export const CCTV_BASE_URL = "https://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image";

/** Stop hammering a dead upstream; an outage should cost one slice, not a full run. */
const MAX_CONSECUTIVE_FAILURES = 10;

/** Every camera is refreshed once per this many slices. 3 slices x 5 min = 15 min. */
export const SLICE_COUNT = 3;
const SLICE_INTERVAL_MS = 5 * 60 * 1000;

export interface CameraEntry {
    id: string;
    jps_camera_id: string;
    captured_at: string | null;
    [key: string]: unknown;
}

/**
 * Which third of the camera list this run owns, derived from the clock.
 *
 * Deriving it from the time means no cursor has to be stored, so a missed or retried
 * run cannot stall the rotation or double-mirror a slice — it simply picks up whichever
 * third the current wall clock points at.
 */
export function sliceIndex(now: number): number {
    return Math.floor(now / SLICE_INTERVAL_MS) % SLICE_COUNT;
}

/**
 * Partitions by position, not by hash: every camera lands in exactly one slice and all
 * three slices together cover the list with no gaps or repeats, whatever its length.
 */
export function selectSlice(cameras: CameraEntry[], now: number): CameraEntry[] {
    const slice = sliceIndex(now);
    return cameras.filter((_, i) => i % SLICE_COUNT === slice);
}

export async function readCameras(bucket: R2Bucket): Promise<CameraEntry[]> {
    const object = await bucket.get(SNAPSHOT_KEYS.cameras);
    if (!object) return [];
    try {
        const parsed = JSON.parse(await object.text()) as { items?: CameraEntry[] };
        return parsed.items ?? [];
    } catch (error) {
        console.warn(`cameras.json unreadable, nothing to mirror: ${error}`);
        return [];
    }
}

export interface MirrorResult {
    attempted: number;
    uploaded: number;
    skipped?: string;
}

/**
 * Mirrors one slice of CCTV frames to R2 so camera pages never hit JPS live.
 *
 * A camera that fails keeps whatever frame it already has on R2 — a stale frame is far
 * more useful than a broken image, and during an outage every camera fails at once.
 */
export async function mirrorCameras(
    env: Env,
    deps: { now?: () => number; retry?: RetryOverrides } = {}
): Promise<MirrorResult> {
    const now = deps.now ?? Date.now;

    // The water level sync is the authority on whether JPS is up. Mirroring 31 frames
    // into a known outage just burns subrequests to collect 31 failures.
    const state = await readSyncState(env.SYNC_STATE);
    if (state?.lastStatus === "upstream_error") {
        console.warn("JPS marked unreachable by the water level sync; skipping camera mirror");
        return { attempted: 0, uploaded: 0, skipped: "upstream_error" };
    }

    const cameras = await readCameras(env.SNAPSHOT);
    const slice = selectSlice(cameras, now());
    if (slice.length === 0) return { attempted: 0, uploaded: 0 };

    let uploaded = 0;
    let consecutiveFailures = 0;
    const capturedAt = new Date(now()).toISOString();
    const mirrored = new Set<string>();

    for (const camera of slice) {
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;
        try {
            const response = await fetchWithRetry(`${CCTV_BASE_URL}/${camera.jps_camera_id}.jpg`, {
                timeoutMs: 5_000,
                retries: 0,
                ...deps.retry,
            });

            // JPS answers 200 with an HTML error page when a camera is down. Mirroring
            // that would replace a usable frame with a broken image.
            const contentType = response.headers.get("content-type") ?? "";
            if (!contentType.startsWith("image/")) {
                consecutiveFailures += 1;
                console.warn(`camera ${camera.jps_camera_id}: unexpected content-type "${contentType}"`);
                continue;
            }

            const body = new Uint8Array(await response.arrayBuffer());
            if (body.byteLength === 0) {
                consecutiveFailures += 1;
                console.warn(`camera ${camera.jps_camera_id}: empty body`);
                continue;
            }

            await env.SNAPSHOT.put(cameraImageKey(camera.jps_camera_id), body, {
                httpMetadata: { contentType: "image/jpeg", cacheControl: IMAGE_CACHE_CONTROL },
            });
            mirrored.add(camera.id);
            uploaded += 1;
            consecutiveFailures = 0;
        } catch (error) {
            consecutiveFailures += 1;
            console.warn(
                `camera ${camera.jps_camera_id}: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`camera mirror aborted after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
    }

    // Republish so the UI's "as of" captions match the frames just written. Only the
    // mirrored entries move; leaving the rest alone keeps this from overwriting whatever
    // the metadata refresh most recently published.
    if (uploaded > 0) {
        try {
            const all = await readCameras(env.SNAPSHOT);
            const next = all.map((c) => (mirrored.has(c.id) ? { ...c, captured_at: capturedAt } : c));
            await env.SNAPSHOT.put(
                SNAPSHOT_KEYS.cameras,
                JSON.stringify({ generatedAt: capturedAt, items: next }),
                { httpMetadata: { contentType: "application/json", cacheControl: JSON_CACHE_CONTROL } }
            );
        } catch (error) {
            console.error("cameras.json republish failed (frames are mirrored):", error);
        }
    }

    return { attempted: slice.length, uploaded };
}
