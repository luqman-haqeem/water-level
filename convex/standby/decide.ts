import { STALENESS_THRESHOLD_MS } from "../lib/retention";
import type { SnapshotMeta } from "../sync/snapshotBuilder";

export type StandbyReason =
    | "worker-healthy"
    | "snapshot-stale"
    | "meta-missing"
    | "meta-unreadable";

export interface StandbyDecision {
    publish: boolean;
    reason: StandbyReason;
    /** Age of the published snapshot in ms, when it could be read. */
    ageMs?: number;
}

/**
 * Decides whether the standby should take over this cycle.
 *
 * The Worker is the primary publisher and this only steps in once its output has gone
 * stale, so the whole failover story is this one function plus a fifteen-minute cron:
 * no flag to flip, no deploy, and failback happens by itself the moment the Worker resumes.
 *
 * `attemptedAt` is the signal, never `status`. A run that reached JPS and got an error
 * still writes `attemptedAt` and reports `upstream_error` honestly, and the standby
 * would fare no better against the same upstream — whereas a Worker that never ran at
 * all leaves `attemptedAt` frozen, which is exactly the case worth taking over.
 *
 * Unreadable and missing metadata both publish. On a bucket this app depends on
 * entirely, "I cannot tell whether anyone is publishing" is not a safe reason to sit
 * out; a redundant publish costs 88 KB, while a wrongly skipped one costs the outage.
 */
export function decideStandby(metaRaw: string | null, now: number): StandbyDecision {
    if (metaRaw === null) return { publish: true, reason: "meta-missing" };

    let meta: SnapshotMeta;
    try {
        meta = JSON.parse(metaRaw) as SnapshotMeta;
    } catch {
        return { publish: true, reason: "meta-unreadable" };
    }

    const attemptedAt = Date.parse(meta?.attemptedAt ?? "");
    if (!Number.isFinite(attemptedAt)) return { publish: true, reason: "meta-unreadable" };

    const ageMs = now - attemptedAt;
    // A clock skew that puts the snapshot in the future must not read as "ancient".
    if (ageMs < STALENESS_THRESHOLD_MS) return { publish: false, reason: "worker-healthy", ageMs };
    return { publish: true, reason: "snapshot-stale", ageMs };
}
