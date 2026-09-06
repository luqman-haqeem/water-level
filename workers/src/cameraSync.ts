import {
    IMAGE_CACHE_CONTROL,
    JSON_CACHE_CONTROL,
    SNAPSHOT_KEYS,
    cameraImageKey,
    fetchWithRetry,
} from "./shared";
import { readSyncState } from "./syncState";
import type { RetryOverrides } from "./jps";
import { SNAPSHOT_KEYS as KEYS } from "./shared";

// HTTPS, never http. Over cleartext a network attacker could substitute the frames we
// mirror and then serve from our own domain. Phase 0 saw https 522 once and http
// succeed, but that was JPS flakiness, not TLS — the answer is to retry, not downgrade.
export const CCTV_BASE_URL = "https://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image";

/** Stop hammering a dead upstream; an outage should cost one slice, not a full run. */
const MAX_CONSECUTIVE_FAILURES = 10;

/**
 * How often this Worker is scheduled. **Must equal the cron period in
 * wrangler.cameras.toml** — the slice is derived from the clock, so if the cron fires
 * less often than this the index does not advance and the same slice is mirrored every
 * time, leaving the rest to go stale forever with no error. Pinned by test.
 */
export const SLICE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Two slices, not three: 92 cameras must be split so each run stays under the free
 * plan's 50 external subrequests per invocation. Two gives ~46 per run and a full
 * refresh every 30 minutes; three would be safer on subrequests but stretch the cycle
 * to 45 minutes. Cameras on a rising river bypass the rotation entirely and are
 * mirrored every run, so the cycle length only governs the quiet ones.
 */
export const SLICE_COUNT = 2;

export interface CameraEntry {
    id: string;
    jps_camera_id: string;
    captured_at: string | null;
    /** JPS id of the station this camera watches, when known. See cameraLinks.ts. */
    station_id?: string | null;
    [key: string]: unknown;
}

/**
 * Reads which stations are currently at alert or above, from the published snapshot.
 *
 * Cheap enough to do every run — one R2 GET of a file the mirror already depends on —
 * and it keeps the mirror from needing its own view of the water level data.
 */
export async function readElevatedStations(bucket: R2Bucket): Promise<Set<string>> {
    const object = await bucket.get(KEYS.stations);
    if (!object) return new Set();
    try {
        const parsed = JSON.parse(await object.text()) as {
            items?: Array<{ id: string; current_levels?: { alert_level: string } | null }>;
        };
        return new Set(
            (parsed.items ?? [])
                .filter((s) => Number(s.current_levels?.alert_level ?? -1) >= 1)
                .map((s) => s.id)
        );
    } catch {
        return new Set();
    }
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
 * Partitions by position, not by hash: every camera lands in exactly one slice and the
 * slices together cover the list with no gaps or repeats, whatever its length.
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

    // The rotation alone would refresh every camera every 15 minutes, including the ones
    // watching a river that is rising — a three-fold slowdown exactly when the frames
    // matter most. Cameras at alert-or-above stations are therefore mirrored every run,
    // on top of the slice. There are few of them, so the subrequest count stays far
    // under the 50 cap.
    const elevated = await readElevatedStations(env.SNAPSHOT);
    const priority = cameras.filter((c) => c.station_id && elevated.has(c.station_id));

    const slice = [...new Map([...selectSlice(cameras, now()), ...priority].map((c) => [c.id, c])).values()];
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
