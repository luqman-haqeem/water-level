import { computeAlertLevel, convertJpsDateToIso, parseThreshold } from "./shared";
import type { DistrictOutcome, JpsStation } from "./jps";
import type { Coordinates } from "./coordinates";

/**
 * A station as published in `stations.json`. Field names are snake_case because the
 * shape is the frontend's contract, inherited from the Convex query it used to
 * serialise verbatim.
 */
export interface SnapshotStation {
    id: string;
    station_name: string;
    station_status: boolean;
    latitude: number;
    longitude: number;
    normal_water_level: number | null;
    alert_water_level: number | null;
    warning_water_level: number | null;
    danger_water_level: number | null;
    districts: { name: string } | null;
    current_levels: { current_level: number; updated_at: string; alert_level: string } | null;
    cameras: null;
}

/**
 * Station identity is JPS's own `id`, stringified — the same value Convex stored as
 * `jpsSelId`.
 *
 * Convex document ids were used before, which the migration cannot reproduce: JPS has
 * never heard of them. Keying on the upstream id also makes duplicates impossible by
 * construction. Production had accumulated 270 station documents for 177 real
 * stations because the upsert matched `jpsSelId` with `.first()` and silently began
 * writing to the other twin.
 */
export function stationId(station: JpsStation): string {
    return String(station.id);
}

function coordinate(raw: string | number): number {
    const n = typeof raw === "string" ? parseFloat(raw) : raw;
    return Number.isFinite(n) ? n : 0;
}

/** JPS's null sentinel for "no reading". Kept out of the snapshot as `null`. */
const NO_READING = -9999;

export function toSnapshotStation(
    station: JpsStation,
    districtName: string,
    coordinates: Coordinates = {}
): SnapshotStation {
    const currentWaterLevel =
        station.waterLevel === null || station.waterLevel === NO_READING ? null : station.waterLevel;

    const thresholds = {
        normalLevel: parseThreshold(station.wlth_normal),
        alertLevel: parseThreshold(station.wlth_alert),
        warningLevel: parseThreshold(station.wlth_warning),
        dangerLevel: parseThreshold(station.wlth_danger),
    };

    const alertLevel = computeAlertLevel({
        currentWaterLevel,
        waterlevelStatus: station.waterlevelStatus ?? -1,
        ...thresholds,
    });

    // The district endpoint sends an empty string for every coordinate, so these come
    // from the station index (see coordinates.ts) and fall back to whatever it last
    // supplied. Only then to 0, which the frontend reads as "no pin".
    const id = stationId(station);
    const known = coordinates[id];

    return {
        id,
        station_name: station.stationName,
        station_status: station.stationStatus === 1,
        latitude: known?.latitude ?? coordinate(station.latitude),
        longitude: known?.longitude ?? coordinate(station.longitude),
        // `parseThreshold` returns undefined for absent; the snapshot uses null, and
        // absent must stay absent — collapsing it to 0 made `level >= danger` true for
        // every reading and classified safe stations as DANGER (#73).
        normal_water_level: thresholds.normalLevel ?? null,
        alert_water_level: thresholds.alertLevel ?? null,
        warning_water_level: thresholds.warningLevel ?? null,
        danger_water_level: thresholds.dangerLevel ?? null,
        districts: { name: districtName },
        current_levels:
            currentWaterLevel === null
                ? null
                : {
                      current_level: currentWaterLevel,
                      updated_at: convertJpsDateToIso(station.lastUpdate),
                      alert_level: String(alertLevel),
                  },
        // Station-to-camera linkage is rebuilt by the camera Worker (Phase 3/4).
        cameras: null,
    };
}

/**
 * Flattens district outcomes into the published station list.
 *
 * Keeps the Convex filter `stationStatus == 1`: JPS lists decommissioned and
 * unconfigured stations, and publishing them is what left the app showing stations
 * that have never reported (#85). Sorted by id so the output is deterministic —
 * without it, district completion order would reshuffle the file every run and defeat
 * byte-comparison in tests.
 */
export function buildStations(
    districts: DistrictOutcome[],
    coordinates: Coordinates = {}
): SnapshotStation[] {
    // Keyed by id, so one JPS station can only ever produce one entry. Convex matched
    // on jpsSelId with `.first()` and quietly began writing to a second document,
    // leaving 270 records for 177 stations; a Map makes that failure unrepresentable
    // rather than something a later cleanup has to find.
    const byId = new Map<string, SnapshotStation>();
    for (const d of districts) {
        for (const s of d.stations) {
            if (s.stationStatus !== 1) continue;
            byId.set(stationId(s), toSnapshotStation(s, d.districtName, coordinates));
        }
    }
    return [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id));
}
