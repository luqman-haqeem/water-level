import { SNAPSHOT_KEYS, fetchWithRetry } from "./shared";
import type { RetryOverrides } from "./jps";

export type Coordinates = Record<string, { latitude: number; longitude: number }>;

interface JpsIndexStation {
    /** Numeric JPS station key — the same value the district endpoint calls `id`. */
    stationId: number;
    latitude: string | number;
    longitude: string | number;
}

function parse(raw: string | number): number | null {
    const n = typeof raw === "string" ? parseFloat(raw) : raw;
    return Number.isFinite(n) && n !== 0 ? n : null;
}

/**
 * Fetches station coordinates from the index endpoint.
 *
 * The per-district endpoint returns an empty string for every latitude and longitude —
 * 0 of 176 stations carry them — so coordinates cannot come from the same fetch that
 * produces the readings, contrary to what the migration plan assumed. This endpoint has
 * them for all 81 active stations.
 *
 * It is also the endpoint commit 8c7fded gave up on as "Convex cannot reach JPS API".
 * It is reachable; it is just slow (16-22 s) and shares the ~40% connect-stall rate of
 * every other JPS endpoint, which is why callers must tolerate it failing.
 */
export async function fetchCoordinates(baseUrl: string, retry: RetryOverrides = {}): Promise<Coordinates> {
    const res = await fetchWithRetry(`${baseUrl}/StationRiverLevels`, {
        timeoutMs: 25_000,
        retries: 1,
        backoffMs: 5_000,
        ...retry,
    });
    const parsed: unknown = await res.json();
    if (!Array.isArray(parsed)) throw new Error("JPS station index response is not an array");

    const out: Coordinates = {};
    for (const s of parsed as JpsIndexStation[]) {
        const latitude = parse(s.latitude);
        const longitude = parse(s.longitude);
        if (latitude !== null && longitude !== null) {
            out[String(s.stationId)] = { latitude, longitude };
        }
    }
    return out;
}

/**
 * Recovers coordinates from the snapshot we published last time.
 *
 * Coordinates change approximately never, but the endpoint that serves them fails
 * often. Carrying the last known values forward means a flaky metadata fetch degrades
 * to "map pins are as old as the last successful fetch" instead of "every pin jumps to
 * the Gulf of Guinea".
 */
export async function readPublishedCoordinates(bucket: R2Bucket): Promise<Coordinates> {
    const object = await bucket.get(SNAPSHOT_KEYS.stations);
    if (!object) return {};
    try {
        const parsed = JSON.parse(await object.text()) as {
            items?: Array<{ id: string; latitude?: number; longitude?: number }>;
        };
        const out: Coordinates = {};
        for (const s of parsed.items ?? []) {
            if (s.latitude && s.longitude) out[s.id] = { latitude: s.latitude, longitude: s.longitude };
        }
        return out;
    } catch {
        return {};
    }
}

/** Fresh values win; previously published ones fill the gaps. */
export function mergeCoordinates(previous: Coordinates, fresh: Coordinates): Coordinates {
    return { ...previous, ...fresh };
}
