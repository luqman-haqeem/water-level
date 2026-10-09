import { STALENESS_THRESHOLD_MS } from "@/utils/timeUtils";
import type { SnapshotMeta } from "@/lib/snapshotTypes";

/** Beyond this, meta.json's own attempt time means our pipeline stopped, not JPS. */
export const SNAPSHOT_STALE_THRESHOLD_MS = 15 * 60 * 1000;

export type FreshnessState =
    | { kind: "fresh" }
    | { kind: "jps-lagging"; jpsLastUpdate: string; attemptedAt: string }
    | { kind: "upstream-down"; since: string; lastGood: string | null }
    | { kind: "snapshot-unreachable"; lastGood: string | null }
    | { kind: "snapshot-stale"; attemptedAt: string };

/**
 * Derives the global data-freshness banner state.
 * - fetchError wins: we can't even read meta.json (offline, CDN down).
 * - then the scraper's own status (JPS unreachable).
 * - then our own staleness: meta.json loaded but its attemptedAt is old, which
 *   means an R2 publish failure, a dead cron, or a service worker handing us a
 *   stale copy — we can't trust anything beside it either.
 * - then JPS's feed age (they publish irregularly under load).
 */
export function getFreshnessState(
    meta: SnapshotMeta | undefined,
    fetchError: Error | null,
    now: number
): FreshnessState {
    if (fetchError) return { kind: "snapshot-unreachable", lastGood: meta?.syncedAt ?? null };
    if (!meta) return { kind: "fresh" };
    if (meta.status === "upstream_error") {
        return { kind: "upstream-down", since: meta.failingSince ?? meta.attemptedAt, lastGood: meta.syncedAt };
    }
    if (now - Date.parse(meta.attemptedAt) > SNAPSHOT_STALE_THRESHOLD_MS) {
        return { kind: "snapshot-stale", attemptedAt: meta.attemptedAt };
    }
    if (meta.jpsLastUpdate && now - Date.parse(meta.jpsLastUpdate) >= STALENESS_THRESHOLD_MS) {
        return { kind: "jps-lagging", jpsLastUpdate: meta.jpsLastUpdate, attemptedAt: meta.attemptedAt };
    }
    return { kind: "fresh" };
}
