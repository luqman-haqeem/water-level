export { readCameras, type CameraEntry, type SnapshotReader } from "./snapshotFiles";
import { readCameras, type CameraEntry } from "./snapshotFiles";
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
 * Long enough to survive a JPS connect stall.
 *
 * Was 5 s, inherited from the Convex version, and it lost 23 of 31 frames on the first
 * staging run. JPS answers a CCTV request in 1.6-3 s normally, but roughly one attempt
 * in six stalls ~16-20 s at TCP connect — the same SYN-retransmission behaviour Phase 0
 * measured on every other JPS endpoint. A 5 s deadline turns every stalled connection
 * into a lost frame.
 */
const FETCH_TIMEOUT_MS = 20_000;

/**
 * Fetches in flight at once.
 *
 * Sequential fetches at a 20 s timeout could take 46 x 20 s in the worst case, past the
 * 15-minute cron wall clock and into the next scheduled run. Six at a time bounds a bad
 * slice to roughly two and a half minutes, and 46 subrequests still sits under the free
 * plan's 50 per invocation.
 */
export const CONCURRENCY = 6;

/**
 * Runs `fn` over `items` with at most `limit` in flight.
 *
 * Workers share a cursor rather than being handed fixed chunks, so one slow camera
 * cannot leave a lane idle while others queue behind it.
 */
async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
    let next = 0;
    const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            await fn(items[next++]);
        }
    });
    await Promise.all(lanes);
}

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

    // `consecutiveFailures` means "failures since the last success" here rather than a
    // strict run of adjacent ones, because lanes interleave. The protective intent is
    // the same: during a total outage nothing succeeds, the count climbs, and the run
    // stops instead of spending its whole subrequest budget collecting failures.
    await runPool(slice, CONCURRENCY, async (camera) => {
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return;
        try {
            const response = await fetchWithRetry(`${CCTV_BASE_URL}/${camera.jps_camera_id}.jpg`, {
                timeoutMs: FETCH_TIMEOUT_MS,
                retries: 0,
                ...deps.retry,
            });

            // JPS answers 200 with an HTML error page when a camera is down. Mirroring
            // that would replace a usable frame with a broken image.
            const contentType = response.headers.get("content-type") ?? "";
            if (!contentType.startsWith("image/")) {
                consecutiveFailures += 1;
                console.warn(`camera ${camera.jps_camera_id}: unexpected content-type "${contentType}"`);
                return;
            }

            const body = new Uint8Array(await response.arrayBuffer());
            if (body.byteLength === 0) {
                consecutiveFailures += 1;
                console.warn(`camera ${camera.jps_camera_id}: empty body`);
                return;
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
    });

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
