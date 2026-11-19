import type { JpsDistrictSummary } from "./jps";
import type { Coordinates } from "./coordinates";
import type { SnapshotStation } from "./stationMapper";
import type { StationCamera } from "./stationCameras";
import type { SyncStateRow } from "./syncState";

/**
 * Deciding which upstream calls a run actually needs.
 *
 * On Cloudflare's free plan a cron invocation gets 10 ms of CPU, and the dominant cost
 * is not our code but per-call overhead: each awaited response body costs ~1.2 ms in
 * workerd against ~0.4 ms to parse it (measured 2026-11-19). A changed run used to make
 * ~15 such reads (summary, 9 districts, station index, 3 R2 objects, KV), which is the
 * 12-15 ms median staging has run at since September. Fewer calls is the only lever
 * that moves it, so:
 *
 * 1. **Districts JPS has not updated are not re-fetched.** The summary carries a
 *    per-district `lastUpdated`; a district whose stamp matches the last successful
 *    fetch reuses the stations already published for it.
 * 2. **The station index is fetched at most daily.** It only supplies coordinates,
 *    which change approximately never.
 *
 * Both are bounded by a full refresh, so a stamp JPS forgot to bump cannot pin a
 * district's readings forever.
 */

/** Every district is re-fetched at least this often, whatever the stamps say. */
export const FULL_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
/** The coordinate index is re-fetched at least this often. */
export const COORDINATES_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface DistrictPlan {
    /** Districts to fetch this run. */
    fetch: JpsDistrictSummary[];
    /** Districts whose published stations are reused unchanged. */
    reuse: JpsDistrictSummary[];
    /** True when every district is being fetched (a full refresh). */
    full: boolean;
}

const ageMs = (iso: string | undefined, now: number) =>
    iso ? now - Date.parse(iso) : Number.POSITIVE_INFINITY;

export function planDistricts(
    summary: JpsDistrictSummary[],
    previous: SyncStateRow | null,
    published: SnapshotStation[] | null,
    now: number
): DistrictPlan {
    const stamps = previous?.districtStamps;
    const fullDue = !(ageMs(previous?.lastFullFetchAt, now) < FULL_REFRESH_INTERVAL_MS);
    if (!stamps || !published || fullDue) return { fetch: summary, reuse: [], full: true };

    const fetch: JpsDistrictSummary[] = [];
    const reuse: JpsDistrictSummary[] = [];
    for (const d of summary) {
        const unchanged = stamps[String(d.districtId)] === d.lastUpdated;
        (unchanged ? reuse : fetch).push(d);
    }
    return { fetch, reuse, full: reuse.length === 0 };
}

export function shouldFetchCoordinates(
    previous: SyncStateRow | null,
    published: SnapshotStation[] | null,
    now: number
): boolean {
    const hasPins = (published ?? []).some((s) => s.latitude && s.longitude);
    if (!hasPins) return true;
    return !(ageMs(previous?.coordinatesFetchedAt, now) < COORDINATES_REFRESH_INTERVAL_MS);
}

/**
 * The published stations belonging to the reused districts, refreshed with this run's
 * camera roster (so `captured_at` keeps moving) and coordinates. Readings, thresholds
 * and alert levels are carried over exactly as published.
 */
export function reusedStations(
    published: SnapshotStation[],
    reuse: JpsDistrictSummary[],
    coordinates: Coordinates,
    cameras: Record<string, StationCamera>
): SnapshotStation[] {
    const names = new Set(reuse.map((d) => d.district));
    return published
        .filter((s) => s.districts && names.has(s.districts.name))
        .map((s) => {
            const pin = coordinates[s.id];
            return {
                ...s,
                latitude: pin?.latitude ?? s.latitude,
                longitude: pin?.longitude ?? s.longitude,
                cameras: cameras[s.id] ?? null,
            };
        });
}

/** Fetched stations win over reused ones; output sorted by id, as `buildStations` does. */
export function mergeStations(fetched: SnapshotStation[], reused: SnapshotStation[]): SnapshotStation[] {
    const byId = new Map<string, SnapshotStation>();
    for (const s of reused) byId.set(s.id, s);
    for (const s of fetched) byId.set(s.id, s);
    return [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

/**
 * Per-district stamps to store: reused districts keep their stamp, fetched ones record
 * the summary's, and failed ones are omitted so the next run fetches them again.
 */
export function nextDistrictStamps(
    plan: DistrictPlan,
    previous: SyncStateRow | null,
    failedIds: Set<number>
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of plan.reuse) {
        const stamp = previous?.districtStamps?.[String(d.districtId)];
        if (stamp) out[String(d.districtId)] = stamp;
    }
    for (const d of plan.fetch) {
        if (!failedIds.has(d.districtId)) out[String(d.districtId)] = d.lastUpdated;
    }
    return out;
}
