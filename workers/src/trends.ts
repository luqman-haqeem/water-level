import { SNAPSHOT_KEYS, TRENDS_WINDOW_MS } from "./shared";
import type { SnapshotStation } from "./stationMapper";

export interface TrendPoint {
    timestamp: number;
    currentLevel: number;
    alertLevel: number;
    recordedAt: string;
}

export type Trends = Record<string, TrendPoint[]>;

/**
 * Reads the published trends back out of R2.
 *
 * `trends.json` *is* the history store now — there is no history table to query. A
 * missing or unparseable object yields an empty history rather than failing the run:
 * losing three hours of trend is bad, refusing to publish current readings during a
 * flood is worse.
 */
export async function readTrends(bucket: R2Bucket): Promise<Trends> {
    const object = await bucket.get(SNAPSHOT_KEYS.trends);
    if (!object) return {};
    try {
        const parsed = JSON.parse(await object.text()) as { items?: Trends };
        return parsed.items ?? {};
    } catch (error) {
        console.warn(`trends.json unreadable, starting a fresh window: ${error}`);
        return {};
    }
}

/**
 * Appends this run's readings and drops anything older than the published window.
 *
 * Only the *presentation* window is pruned here. Long-term retention is a separate
 * store with its own window (`HISTORY_RETENTION_MS`) — the two were the same constant
 * once, which is why the app accumulated no history at all (#80). Do not re-merge them.
 *
 * A station is only appended to when it has a reading, so an outage leaves the last
 * good curve intact instead of punching a hole in it.
 */
export function appendTrends(previous: Trends, stations: SnapshotStation[], now: number): Trends {
    const cutoff = now - TRENDS_WINDOW_MS;
    const next: Trends = {};

    for (const station of stations) {
        const history = (previous[station.id] ?? []).filter((p) => p.timestamp >= cutoff);
        const reading = station.current_levels;

        if (reading) {
            const timestamp = Date.parse(reading.updated_at);
            // JPS republishes the same reading between updates; appending it again would
            // inflate the series with duplicates that render as a flat run.
            const isNew = !history.some((p) => p.timestamp === timestamp);
            if (Number.isFinite(timestamp) && isNew) {
                history.push({
                    timestamp,
                    currentLevel: reading.current_level,
                    alertLevel: Number(reading.alert_level),
                    recordedAt: reading.updated_at,
                });
            }
        }

        if (history.length > 0) {
            history.sort((a, b) => a.timestamp - b.timestamp);
            next[station.id] = history;
        }
    }

    return next;
}
