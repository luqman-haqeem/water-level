import { computeJpsFingerprint, fingerprintToRecord, latestJpsUpdate } from "./shared";
import { computeOverallStatus, fetchAllDistricts, fetchSummary, type RetryOverrides } from "./jps";
import { buildStations } from "./stationMapper";
import { publishMeta, publishSnapshot } from "./publish";
import { readSyncState, recordSyncState } from "./syncState";
import { appendTrends, readTrends } from "./trends";
import { fetchCoordinates, mergeCoordinates, readPublishedCoordinates } from "./coordinates";

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

    // 3. District data and coordinates, concurrently. Coordinates live on a different
    // endpoint than the readings, and it fails independently, so it must not be able to
    // take the run down — hence `allSettled` semantics via the catch below.
    const [districts, coordinates] = await Promise.all([
        fetchAllDistricts(env.JPS_BASE_URL, summary, retry),
        fetchCoordinates(env.JPS_BASE_URL, retry).catch((error) => {
            console.warn(`Station index fetch failed, reusing published coordinates: ${error}`);
            return null;
        }),
    ]);
    const failedDistricts = districts.filter((d) => d.error).length;

    // Every district failed: JPS answered the summary but served nothing else. That is
    // an upstream outage, not a successful sync of zero stations — publishing an empty
    // stations.json here would blank the app.
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

    // Read the previous coordinates before overwriting stations.json, so a failed index
    // fetch carries the last known pins forward instead of blanking the map.
    const previousCoordinates = await readPublishedCoordinates(env.SNAPSHOT);
    const stations = buildStations(
        districts,
        mergeCoordinates(previousCoordinates, coordinates ?? {})
    );
    const trends = appendTrends(await readTrends(env.SNAPSHOT), stations, now());

    // 4. Record, then publish. When some districts failed the fingerprint is withheld,
    // so the next run re-fetches instead of treating a partial sync as complete.
    const state = await recordSyncState(env.SYNC_STATE, previous, {
        attemptedAt,
        status: "ok",
        fingerprint: fingerprintToRecord(fingerprint, failedDistricts),
        jpsLastUpdate,
        syncedAt: attemptedAt,
    });
    await publishQuietly(() =>
        publishSnapshot(env.SNAPSHOT, {
            stations, trends, state, attemptedAt, generatedAt: attemptedAt,
        })
    );

    return {
        success: true, changed: true, districtsCount: summary.length,
        stationsCount: stations.length, overallStatus, timestamp: attemptedAt,
    };
}
