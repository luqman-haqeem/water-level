/**
 * The pure, runtime-agnostic modules the Worker shares with the Convex pipeline.
 *
 * They still physically live under `convex/` because both backends have to run
 * simultaneously through Phase 6 — Convex stays deployed but dormant so cutover is a
 * config change rather than a redeploy. Duplicating them would let the two copies
 * drift silently; moving them now would churn `convex/`, which is under active
 * development on this branch.
 *
 * So the coupling is deliberately funnelled through this one file: Phase 7 relocates
 * the sources here and only these import paths change. Nothing else in `workers/`
 * reaches into `convex/`.
 *
 * Every module below is dependency-free — no `convex/values`, no `_generated` — which
 * is what makes them portable at all. That property is self-enforcing: adding a Convex
 * import to any of them breaks the Worker bundle, and the Worker suite fails to build.
 */
export { convertJpsDateToIso } from "../../convex/sync/jpsDate";

export {
    type DistrictStamp,
    computeJpsFingerprint,
    fingerprintToRecord,
    latestJpsUpdate,
} from "../../convex/sync/changeDetection";

export {
    SNAPSHOT_KEYS,
    JSON_CACHE_CONTROL,
    IMAGE_CACHE_CONTROL,
    cameraImageKey,
    type SyncStatus,
    type SnapshotMeta,
    type SnapshotEnvelope,
    type SnapshotFile,
    type SyncStateLike,
    buildDataFiles,
    buildMetaFile,
    metaFromSyncState,
} from "../../convex/sync/snapshotBuilder";

export { type FetchRetryOptions, fetchWithRetry } from "../../convex/lib/fetchWithRetry";

export {
    ALERT_LEVEL,
    type StationThresholds,
    parseThreshold,
    classifyByThresholds,
    computeAlertLevel,
} from "../../convex/lib/alertLevel";

export {
    TRENDS_WINDOW_MS,
    HISTORY_RETENTION_MS,
    CLEANUP_BATCH_SIZE,
    CLEANUP_MAX_BATCHES_PER_RUN,
} from "../../convex/lib/retention";
