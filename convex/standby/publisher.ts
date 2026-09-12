"use node";

import { internalAction } from "../_generated/server";
import { createR2Client, r2ConfigFromEnv, type R2Client } from "../lib/r2";
import {
    JSON_CACHE_CONTROL,
    SNAPSHOT_KEYS,
    buildDataFiles,
    buildMetaFile,
    type SnapshotMeta,
} from "../sync/snapshotBuilder";
import { latestJpsUpdate } from "../sync/changeDetection";
import { decideStandby, type StandbyReason } from "./decide";
import {
    computeOverallStatus,
    fetchAllDistricts,
    fetchSummary,
    type RetryOverrides,
} from "../../workers/src/jps";
import { buildStations } from "../../workers/src/stationMapper";
import {
    fetchCoordinates,
    mergeCoordinates,
    readPublishedCoordinates,
} from "../../workers/src/coordinates";
import { readCameras, type SnapshotReader } from "../../workers/src/snapshotFiles";
import { indexCamerasByStation } from "../../workers/src/stationCameras";
import { appendTrends, readTrends } from "../../workers/src/trends";

const JSON_PUT = { contentType: "application/json", cacheControl: JSON_CACHE_CONTROL };

const jpsBaseUrl = () =>
    process.env.JPS_BASE_URL ?? "https://infobanjirjps.selangor.gov.my/JPSAPI/api";

export interface StandbyResult {
    published: boolean;
    reason: StandbyReason | "r2-unreachable" | "upstream-error";
    ageMs?: number;
    stationsCount?: number;
    failedDistricts?: number;
}

/** Adapts the R2 client to the structural reader the shared modules expect. */
function readerFor(r2: R2Client): SnapshotReader {
    return {
        async get(key: string) {
            const body = await r2.getObject(key);
            return body === null ? null : { text: async () => body };
        },
    };
}

/**
 * Publishes the snapshot when the Cloudflare Worker has stopped doing so.
 *
 * Free-plan Worker cron is best-effort capacity: measured over 119 h, 13.9% of windows
 * never fired and two blackouts lasted 3.5 h and 6 h, both Workers stopping within the
 * same minute. R2 itself stayed healthy throughout — nothing was *writing* to it. So
 * this is a second writer rather than a second read path, and the app needs no
 * knowledge of it: same bucket, same keys, same bytes.
 *
 * Deliberately simpler than `workers/src/sync.ts`, which optimises steady state by
 * short-circuiting on an unchanged JPS fingerprint. That optimisation is pointless here
 * — this only runs when the snapshot is already 45 minutes stale, so there is always
 * something worth publishing. The contract-critical code (`buildStations`,
 * `appendTrends`, `buildDataFiles`) is shared with the Worker, which is what keeps the
 * two outputs identical; only the orchestration differs, and it differs on purpose.
 *
 * Never mirrors camera frames. One mirroring run moves 11.4 MB, more than half a
 * month's standby egress budget in a single invocation, and camera JPEGs were 97% of
 * the 34 GB/month that motivated moving off Convex in the first place. Frames freeze
 * during a blackout by design; the frontend serves live JPS images instead.
 */
export interface StandbyDeps {
    /** Injectable clock, so tests can pin `generatedAt` and the trend window. */
    now?: () => number;
    baseUrl?: string;
    /** Retry overrides; tests inject a no-op sleep to skip the 5 s backoff. */
    retry?: RetryOverrides;
}

/**
 * The standby run, with its I/O passed in.
 *
 * Split from the action so the publishing path can be exercised against a fake bucket:
 * the R2 credentials in production are scoped to the real buckets, so there is no
 * scratch bucket to rehearse against, and this is the only branch that matters most.
 */
export async function runStandbyPublish(
    r2: R2Client,
    deps: StandbyDeps = {}
): Promise<StandbyResult> {
    const now = (deps.now ?? Date.now)();
    const baseUrl = deps.baseUrl ?? jpsBaseUrl();
    const retry = deps.retry ?? {};

    let metaRaw: string | null;
    try {
        metaRaw = await r2.getObject(SNAPSHOT_KEYS.meta);
    } catch (error) {
        // If R2 cannot be read it almost certainly cannot be written either, so
        // there is nothing useful to attempt this cycle.
        console.warn(`standby: R2 unreachable, skipping: ${String(error)}`);
        return { published: false, reason: "r2-unreachable" };
    }

    const decision = decideStandby(metaRaw, now);
    if (!decision.publish) {
        return { published: false, reason: decision.reason, ageMs: decision.ageMs };
    }
    console.log(
        `standby: taking over (${decision.reason}` +
            `${decision.ageMs === undefined ? "" : `, snapshot ${Math.round(decision.ageMs / 60000)} min old`})`
    );

    const attemptedAt = new Date(now).toISOString();
    const reader = readerFor(r2);

    // The summary is the only fetch whose failure aborts the run: without it there
    // are no districts to walk, and publishing a partial snapshot would be worse
    // than leaving the stale one in place with its honest timestamp.
    let summary;
    try {
        summary = await fetchSummary(baseUrl, retry);
    } catch (error) {
        console.error(`standby: JPS summary fetch failed: ${String(error)}`);
        return { published: false, reason: "upstream-error" };
    }

    const districts = await fetchAllDistricts(baseUrl, summary, retry);
    const failedDistricts = districts.filter((d) => d.error).length;

    // JPS answered the summary but served no district: an upstream outage, not a
    // successful sync of zero stations. Publishing here would blank the app, which
    // is strictly worse than leaving the stale snapshot with its honest timestamp.
    if (summary.length > 0 && failedDistricts === summary.length) {
        console.error(`standby: all ${summary.length} district fetches failed, not publishing`);
        return { published: false, reason: "upstream-error", failedDistricts };
    }
    if (failedDistricts > 0) {
        console.warn(`standby: ${failedDistricts} district fetch(es) failed, publishing the rest`);
    }

    // Coordinates come from a separate endpoint that fails often; falling back to the
    // ones already published keeps map pins put instead of blanking them.
    let fresh = {};
    try {
        fresh = await fetchCoordinates(baseUrl, retry);
    } catch (error) {
        console.warn(`standby: coordinate fetch failed, reusing published pins: ${String(error)}`);
    }
    const coordinates = mergeCoordinates(await readPublishedCoordinates(reader), fresh);

    // Read-only. cameras.json belongs to the mirror Worker and is not republished
    // here — stations only carry a copy of which camera watches them.
    const stationCameras = indexCamerasByStation(await readCameras(reader));
    const stations = buildStations(districts, coordinates, stationCameras);
    const trends = appendTrends(await readTrends(reader), stations, now);

    // cameras.json is filtered out: republishing an unchanged 24 KB roster every
    // cycle would add a quarter to the egress for no gain.
    const files = buildDataFiles({ stations, cameras: [], trends, generatedAt: attemptedAt })
        .filter((file) => file.key !== SNAPSHOT_KEYS.cameras);
    for (const file of files) {
        await r2.putObject(file.key, file.body, JSON_PUT);
    }

    // meta.json last, so it can never advertise data that is not yet beside it.
    const meta: SnapshotMeta = {
        syncedAt: attemptedAt,
        attemptedAt,
        jpsLastUpdate:
            latestJpsUpdate(
                summary.map((d) => ({ districtId: d.districtId, allLastUpdated: d.allLastUpdated }))
            ) ?? null,
        status: "ok",
    };
    const metaFile = buildMetaFile(meta);
    await r2.putObject(metaFile.key, metaFile.body, JSON_PUT);

    console.log(
        `standby: published ${stations.length} stations, overall ${computeOverallStatus(summary)}`
    );
    return {
        published: true,
        reason: decision.reason,
        ageMs: decision.ageMs,
        stationsCount: stations.length,
        failedDistricts,
    };
}

export const publishIfWorkerIsDown = internalAction({
    args: {},
    handler: async (): Promise<StandbyResult> =>
        runStandbyPublish(createR2Client(r2ConfigFromEnv(process.env))),
});
