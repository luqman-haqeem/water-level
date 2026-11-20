import type { Trends } from "./trends";

/**
 * Long-term water level history (#80), kept in R2 alongside the snapshot.
 *
 * `trends.json` holds only the 3-hour presentation window. Everything older used to
 * be thrown away (Convex could afford 14 days at most), so this store is the only
 * place a season's readings survive — and they cannot be backfilled once lost.
 *
 * Design (see the History retention section of
 * docs/superpowers/plans/2026-09-02-cloudflare-workers-migration.md):
 *
 * - **Write-only, one object per changed run**: `history/YYYY-MM-DD/HHMMSS.json`,
 *   holding just the points that run added. The sync never reads history back, so
 *   this costs one R2 write and next to no CPU. A single daily file rewritten every
 *   run would mean parsing and re-serialising up to ~0.8 MB per run, on a Worker
 *   already measured at 7 ms of its 10 ms CPU budget.
 * - **Compact rows** `{ t, v, a }`: timestamp, level, stored alert level. `a` is kept
 *   because a stored level can be -1 (unknown) for reasons thresholds can't recover.
 * - **No pruning.** ~0.3 GB/year against R2's 10 GB free tier.
 * - **Immutable objects.** Nothing is ever rewritten, so they cache forever.
 *
 * Objects are public in the snapshot bucket (owner decision, 2026-11-19): the data
 * is public JPS telemetry, and r2.dev does not allow listing.
 *
 * Both writers emit history: the Worker sync, and the Convex standby publisher during
 * Worker cron blackouts — otherwise history would have holes exactly when the Worker
 * is down. That is why this module is pure and has no R2 types: each writer puts the
 * built file with its own client.
 */

export const HISTORY_PREFIX = "history/";
export const HISTORY_FORMAT_VERSION = 1;
export const HISTORY_CACHE_CONTROL = "public, max-age=31536000, immutable";

export interface HistoryPoint {
    /** Reading time, epoch ms. */
    t: number;
    /** Water level, metres. */
    v: number;
    /** Stored alert level: -1 unknown, 0 normal … 3 danger. */
    a: number;
}

export interface HistoryFile {
    version: typeof HISTORY_FORMAT_VERSION;
    /** When the run that wrote this object happened (ISO). */
    generatedAt: string;
    /** Points this run added, keyed by JPS station id. */
    items: Record<string, HistoryPoint[]>;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** `history/YYYY-MM-DD/HHMMSS.json`, in UTC, from the run time. */
export function historyKey(runAt: number): string {
    const d = new Date(runAt);
    const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const time = `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
    return `${HISTORY_PREFIX}${day}/${time}.json`;
}

/**
 * The points present in `next` but not in `previous` — exactly what this run
 * appended. Points that merely aged out of the trend window are not "new".
 */
export function newHistoryPoints(previous: Trends, next: Trends): Record<string, HistoryPoint[]> {
    const added: Record<string, HistoryPoint[]> = {};

    for (const [stationId, points] of Object.entries(next)) {
        const seen = new Set((previous[stationId] ?? []).map((p) => p.timestamp));
        const fresh = points
            .filter((p) => !seen.has(p.timestamp))
            .map((p) => ({ t: p.timestamp, v: p.currentLevel, a: p.alertLevel }));
        if (fresh.length > 0) added[stationId] = fresh;
    }

    return added;
}

/** Body plus key for one history object; null when the run added no points. */
export interface BuiltHistoryFile {
    key: string;
    body: string;
}

/**
 * Builds this run's history object from the trends before and after appending.
 * Returns null when the run added nothing (JPS republished the same readings).
 * Put it with `contentType: application/json` and `HISTORY_CACHE_CONTROL`.
 */
export function buildHistoryFile(previous: Trends, next: Trends, runAt: number): BuiltHistoryFile | null {
    const items = newHistoryPoints(previous, next);
    if (Object.keys(items).length === 0) return null;

    const file: HistoryFile = {
        version: HISTORY_FORMAT_VERSION,
        generatedAt: new Date(runAt).toISOString(),
        items,
    };
    return { key: historyKey(runAt), body: JSON.stringify(file) };
}
