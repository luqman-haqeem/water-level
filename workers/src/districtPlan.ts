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
 * workerd against ~0.4 ms to parse it (measured 2026-11-19). The station index only
 * supplies coordinates, which change approximately never, so it is fetched at most
 * daily.
 *
 * Skipping districts whose `lastUpdated` had not moved was tried and removed
 * (2026-11-20): JPS bumps every district's stamp every 15 minutes whether or not the
 * readings changed, so over 85 staging runs it skipped essentially nothing.
 */

/** The coordinate index is re-fetched at least this often. */
export const COORDINATES_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

const ageMs = (iso: string | undefined, now: number) =>
    iso ? now - Date.parse(iso) : Number.POSITIVE_INFINITY;

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
 * The published stations belonging to the given districts (those whose fetch failed
 * this run), refreshed with this run's
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
