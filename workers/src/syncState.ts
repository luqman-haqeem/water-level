import type { SyncStateLike, SyncStatus } from "./shared";

/** One KV key replaces the whole Convex `syncState` table — there is only ever one row. */
export const SYNC_STATE_KEY = "syncState:waterLevels";

export interface SyncStateRow extends SyncStateLike {
    lastJpsFingerprint?: string;
    /** Per-district JPS `lastUpdated` from the last successful fetch (see districtPlan.ts). */
    districtStamps?: Record<string, string>;
    /** Last run that fetched every district successfully. */
    lastFullFetchAt?: string;
    /** Last successful station-index (coordinates) fetch. */
    coordinatesFetchedAt?: string;
}

export async function readSyncState(kv: KVNamespace): Promise<SyncStateRow | null> {
    return await kv.get<SyncStateRow>(SYNC_STATE_KEY, "json");
}

export interface RecordArgs {
    attemptedAt: string;
    status: SyncStatus;
    fingerprint?: string;
    jpsLastUpdate?: string;
    syncedAt?: string;
    error?: string;
    districtStamps?: Record<string, string>;
    lastFullFetchAt?: string;
    coordinatesFetchedAt?: string;
}

/**
 * Merges a run's outcome into the stored state, preserving the Convex mutation's
 * semantics exactly:
 *
 * - Absent fields fall back to the previous value rather than clearing it, so a failed
 *   run does not erase the last good fingerprint or sync time.
 * - `failingSince` marks the *first* failure of the current outage and survives
 *   subsequent failures, so the UI can say how long JPS has been down rather than
 *   resetting the clock every five minutes.
 * - A successful run clears `failingSince` and `lastError`.
 */
export function nextSyncState(previous: SyncStateRow | null, args: RecordArgs): SyncStateRow {
    const failing = args.status === "upstream_error";
    return {
        lastJpsFingerprint: args.fingerprint ?? previous?.lastJpsFingerprint,
        lastJpsUpdate: args.jpsLastUpdate ?? previous?.lastJpsUpdate,
        lastSyncedAt: args.syncedAt ?? previous?.lastSyncedAt,
        lastAttemptAt: args.attemptedAt,
        lastStatus: args.status,
        failingSince: failing ? (previous?.failingSince ?? args.attemptedAt) : undefined,
        lastError: failing ? (args.error ?? previous?.lastError) : undefined,
        districtStamps: args.districtStamps ?? previous?.districtStamps,
        lastFullFetchAt: args.lastFullFetchAt ?? previous?.lastFullFetchAt,
        coordinatesFetchedAt: args.coordinatesFetchedAt ?? previous?.coordinatesFetchedAt,
    };
}

export async function recordSyncState(
    kv: KVNamespace,
    previous: SyncStateRow | null,
    args: RecordArgs
): Promise<SyncStateRow> {
    const next = nextSyncState(previous, args);
    await kv.put(SYNC_STATE_KEY, JSON.stringify(next));
    return next;
}
