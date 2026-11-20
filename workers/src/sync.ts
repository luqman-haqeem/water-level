import { computeJpsFingerprint, fingerprintToRecord, latestJpsUpdate } from "./shared";
import { computeOverallStatus, fetchAllDistricts, fetchSummary, type RetryOverrides } from "./jps";
import { buildStations } from "./stationMapper";
import { publishMeta, publishSnapshot } from "./publish";
import { readSyncState, recordSyncState } from "./syncState";
import { appendTrends, readTrends } from "./trends";
import { coordinatesFromStations, fetchCoordinates, mergeCoordinates, readPublishedStations } from "./coordinates";
import { mergeStations, reusedStations, shouldFetchCoordinates } from "./districtPlan";
import { readCameras } from "./cameraSync";
import { indexCamerasByStation } from "./stationCameras";
import { notifyDangerStations } from "./notify";
import { HISTORY_CACHE_CONTROL, buildHistoryFile } from "./history";

export interface SyncResult {
    success: boolean;
    changed: boolean;
    districtsCount: number;
    stationsCount: number;
    overallStatus: string;
    timestamp: string;
    error?: string;
}

/**
 * The water level sync, ported from `convex/sync/waterLevelUpdater.ts`.
 *
 * Publishing must never fail the run for a reason the next run cannot fix, so R2
 * errors are logged rather than thrown — the Convex version made the same call via
 * `publishQuietly`.
 */
async function publishQuietly(fn: () => Promise<void>): Promise<void> {
    try {
        await fn();
    } catch (error) {
        console.error("Snapshot publish failed:", error);
    }
}

export interface SyncDeps {
    /** Injectable clock, so tests can pin `generatedAt` and the trend window. */
    now?: () => number;
    /** Retry overrides; tests use them to skip the 5 s backoff. */
    retry?: RetryOverrides;
}

export async function runSync(env: Env, deps: SyncDeps = {}): Promise<SyncResult> {
    const now = deps.now ?? Date.now;
    const retry = deps.retry ?? {};
    const attemptedAt = new Date(now()).toISOString();

    // Read state before the data, so a concurrent publish cannot make `meta.json`
    // describe a snapshot this run has not written yet.
    const previous = await readSyncState(env.SYNC_STATE);

    // 1. Summary — the only fetch whose failure aborts the run.
    let summary;
    try {
        summary = await fetchSummary(env.JPS_BASE_URL, retry);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("JPS summary fetch failed:", message);
        const state = await recordSyncState(env.SYNC_STATE, previous, {
            attemptedAt,
            status: "upstream_error",
            error: message,
        });
        await publishQuietly(() => publishMeta(env.SNAPSHOT, state, attemptedAt));
        return {
            success: false, changed: false, districtsCount: 0, stationsCount: 0,
            overallStatus: "UNKNOWN", timestamp: attemptedAt, error: message,
        };
    }

    // 2. Change detection. JPS updates irregularly — every 15 min nominally, but
    // hours apart under load — so most runs find nothing new and must not rewrite.
    const stamps = summary.map((d) => ({ districtId: d.districtId, allLastUpdated: d.allLastUpdated }));
    const fingerprint = computeJpsFingerprint(stamps);
    const jpsLastUpdate = latestJpsUpdate(stamps) ?? undefined;
    const overallStatus = computeOverallStatus(summary);

    if (previous && previous.lastJpsFingerprint === fingerprint) {
        const state = await recordSyncState(env.SYNC_STATE, previous, {
            attemptedAt, status: "ok", fingerprint, jpsLastUpdate,
        });
        await publishQuietly(() => publishMeta(env.SNAPSHOT, state, attemptedAt));
        return {
            success: true, changed: false, districtsCount: summary.length, stationsCount: 0,
            overallStatus, timestamp: attemptedAt,
        };
    }

    // 3. Every district, plus the coordinate index at most daily (districtPlan.ts) —
    // per-call overhead, not parsing, is what CPU is spent on. stations.json serves both
    // the coordinate fallback and a failed district's last good stations.
    const published = await readPublishedStations(env.SNAPSHOT);
    const wantCoordinates = shouldFetchCoordinates(previous, published, now());

    // The coordinate index fails independently of the readings, so it must not be able
    // to take the run down — hence `allSettled` semantics via the catch below.
    const [districts, coordinates] = await Promise.all([
        fetchAllDistricts(env.JPS_BASE_URL, summary, retry),
        wantCoordinates
            ? fetchCoordinates(env.JPS_BASE_URL, retry).catch((error) => {
                  console.warn(`Station index fetch failed, reusing published coordinates: ${error}`);
                  return null;
              })
            : Promise.resolve(null),
    ]);
    const failed = districts.filter((d) => d.error);
    const failedDistricts = failed.length;

    // Every district failed: JPS answered the summary but served nothing else. That is
    // an upstream outage, not a successful sync — publishing here would at best repeat
    // the last snapshot and at worst (nothing to fall back on) blank the app.
    if (summary.length > 0 && failedDistricts === summary.length) {
        const message = `All ${summary.length} district fetches failed`;
        console.error(message);
        const state = await recordSyncState(env.SYNC_STATE, previous, {
            attemptedAt, status: "upstream_error", error: message,
        });
        await publishQuietly(() => publishMeta(env.SNAPSHOT, state, attemptedAt));
        return {
            success: false, changed: false, districtsCount: summary.length, stationsCount: 0,
            overallStatus, timestamp: attemptedAt, error: message,
        };
    }

    if (failedDistricts > 0) {
        console.warn(
            `${failedDistricts} district fetch(es) failed; fingerprint withheld so the next run retries`
        );
    }

    // Read-only: cameras.json belongs to the mirror. Stations carry a copy of the camera
    // that watches them, which is what drives the card badge, the "has a camera" filter
    // and the detail page's camera view.
    const stationCameras = indexCamerasByStation(await readCameras(env.SNAPSHOT));
    const mergedCoordinates = mergeCoordinates(coordinatesFromStations(published), coordinates ?? {});
    const stations = mergeStations(
        buildStations(districts, mergedCoordinates, stationCameras),
        // A district whose fetch failed keeps its last published stations rather than
        // vanishing from the app for a cycle; the fingerprint is withheld, so the next
        // run retries it. Previously a flaky JPS connection dropped whole districts (44 of
        // 152 stations on 2026-11-19).
        reusedStations(
            published ?? [],
            summary.filter((d) => failed.some((f) => f.districtId === d.districtId)),
            mergedCoordinates,
            stationCameras
        )
    );
    const previousTrends = await readTrends(env.SNAPSHOT);
    const trends = appendTrends(previousTrends, stations, now());

    // 4. Record, then publish. When some districts failed the fingerprint is withheld,
    // so the next run re-fetches instead of treating a partial sync as complete.
    const state = await recordSyncState(env.SYNC_STATE, previous, {
        attemptedAt,
        status: "ok",
        fingerprint: fingerprintToRecord(fingerprint, failedDistricts),
        jpsLastUpdate,
        syncedAt: attemptedAt,
        coordinatesFetchedAt: coordinates ? attemptedAt : undefined,
    });
    await publishQuietly(() =>
        publishSnapshot(env.SNAPSHOT, {
            stations, trends, state, attemptedAt, generatedAt: attemptedAt,
        })
    );

    // After publishing, never before: an alert that points at data the app cannot yet
    // load is worse than one that arrives five seconds later. Failures here are logged
    // inside and never fail the sync — the readings are already safe on R2.
    await notifyDangerStations(env, stations, now);

    // Long-term history (#80), last: it is the least time-sensitive write, and a
    // failure must not delay alerts or fail the run. A lost object costs one run's
    // points; the next run still writes its own.
    try {
        // Keyed by the run's start, not the write time: the write lands after
        // ~50 s of JPS I/O, and the key should name the run that produced it.
        const history = buildHistoryFile(previousTrends, trends, Date.parse(attemptedAt));
        if (history) {
            await env.SNAPSHOT.put(history.key, history.body, {
                httpMetadata: { contentType: "application/json", cacheControl: HISTORY_CACHE_CONTROL },
            });
        }
    } catch (error) {
        console.error("History write failed:", error);
    }

    return {
        success: true, changed: true, districtsCount: summary.length,
        stationsCount: stations.length, overallStatus, timestamp: attemptedAt,
    };
}
