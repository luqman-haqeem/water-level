import { fetchWithRetry, type FetchRetryOptions } from "./shared";

/** Shapes we consume from the JPS API. Only the fields the snapshot needs. */
export interface JpsDistrictSummary {
    districtId: number;
    district: string;
    normal: number;
    alert: number;
    warning: number;
    danger: number;
    lastUpdated: string;
    allLastUpdated: string;
}

export interface JpsStation {
    /** JPS's own station key. Becomes the public station `id`. */
    id: number;
    stationId: string;
    stationName: string;
    stationCode: string;
    referenceName: string;
    districtName: string;
    waterLevel: number | null;
    wlth_normal: number | null;
    wlth_alert: number | null;
    wlth_warning: number | null;
    wlth_danger: number | null;
    waterlevelStatus: number | null;
    stationStatus: number;
    lastUpdate: string;
    latitude: string | number;
    longitude: string | number;
}

// Phase 0 measured ~40% of JPS connections stalling ~20 s at TCP connect (SYN
// retransmission), from Cloudflare and from a home IP alike. A 20 s timeout with one
// retry therefore covers a normal stall; the districts run concurrently so the run's
// wall clock is the slowest district, not their sum.
const FETCH_OPTS: FetchRetryOptions = { timeoutMs: 20_000, retries: 1, backoffMs: 5_000 };

/**
 * Retry overrides. Production passes nothing; tests inject a no-op `sleep` so the
 * retry path is exercised without paying its 5 s backoff in wall clock.
 */
export type RetryOverrides = Partial<FetchRetryOptions>;

export async function fetchSummary(
    baseUrl: string,
    retry: RetryOverrides = {}
): Promise<JpsDistrictSummary[]> {
    const res = await fetchWithRetry(`${baseUrl}/StationRiverLevels/GetWLStationSummary`, {
        ...FETCH_OPTS,
        ...retry,
    });
    const parsed: unknown = await res.json();
    if (!Array.isArray(parsed)) throw new Error("JPS summary response is not an array");
    return parsed as JpsDistrictSummary[];
}

export interface DistrictOutcome {
    districtId: number;
    districtName: string;
    stations: JpsStation[];
    error?: string;
}

/**
 * Fetches every district concurrently.
 *
 * The Convex version looped sequentially, which measured 162 s for nine districts
 * once the ~20 s stalls are included — survivable inside the 15 min cron budget, but
 * with little room for the retry. Nine concurrent fetches also stay far below the
 * 50-subrequest-per-invocation cap.
 *
 * Failures are returned, not thrown: a single district failing must not lose the
 * other eight, exactly as before.
 */
export async function fetchAllDistricts(
    baseUrl: string,
    summary: JpsDistrictSummary[],
    retry: RetryOverrides = {}
): Promise<DistrictOutcome[]> {
    return Promise.all(
        summary.map(async (d): Promise<DistrictOutcome> => {
            try {
                const res = await fetchWithRetry(
                    `${baseUrl}/StationRiverLevels/GetWLAllStationData/${d.districtId}`,
                    { ...FETCH_OPTS, ...retry }
                );
                const body = (await res.json()) as { stations?: JpsStation[] };
                return { districtId: d.districtId, districtName: d.district, stations: body.stations ?? [] };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Failed to fetch district ${d.districtId}: ${message}`);
                return { districtId: d.districtId, districtName: d.district, stations: [], error: message };
            }
        })
    );
}

/** DANGER > WARNING > ALERT > NORMAL across all districts, as the Convex version reported it. */
export function computeOverallStatus(summary: JpsDistrictSummary[]): string {
    const total = (pick: (d: JpsDistrictSummary) => number) => summary.reduce((n, d) => n + pick(d), 0);
    if (total((d) => d.danger) > 0) return "DANGER";
    if (total((d) => d.warning) > 0) return "WARNING";
    if (total((d) => d.alert) > 0) return "ALERT";
    return "NORMAL";
}
