import { query } from "./_generated/server";
import { v } from "convex/values";

export const getStationsWithDetails = query({
    handler: async (ctx) => {
        // Single query for all stations
        const stations = await ctx.db.query("stations").collect();        // Batch load all districts at once
        const districtIds = Array.from(new Set(stations.map(s => s.districtId)));
        const districts = await Promise.all(
            districtIds.map(id => ctx.db.get(id))
        );
        const districtMap = new Map(
            districts.filter(Boolean).map(d => [d!._id, d!])
        );

        // Batch load all current levels (single indexed query)
        const allCurrentLevels = await ctx.db.query("currentLevels").collect();
        const levelMap = new Map(
            allCurrentLevels.map(l => [l.stationId, l])
        );

        // Batch load all cameras (single indexed query)
        const allCameras = await ctx.db
            .query("cameras")
            .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
            .collect();
        const cameraMap = new Map(
            allCameras
                .filter(c => c.stationId !== undefined)
                .map(c => [c.stationId!, c])
        );

        // Assemble results with lookups (no additional queries!)
        return stations.map(station => {
            const district = districtMap.get(station.districtId);
            const currentLevel = levelMap.get(station._id);
            const stationCamera = cameraMap.get(station._id);

            // Convert string coordinates to numbers if needed
            const convertToNumber = (value: any): number | undefined => {
                if (typeof value === 'number') return value;
                if (typeof value === 'string') {
                    const trimmed = value.trim();
                    const parsed = parseFloat(trimmed);
                    return isNaN(parsed) ? undefined : parsed;
                }
                if (value === null || value === undefined) {
                    return undefined;
                }
                return undefined;
            };

            const latitude = convertToNumber(station.latitude);
            const longitude = convertToNumber(station.longitude);

            return {
                id: station._id,
                station_name: station.stationName,
                latitude: latitude,
                longitude: longitude,
                districts: {
                    name: district?.name || "Unknown"
                },
                current_levels: currentLevel ? {
                    current_level: currentLevel.currentLevel,
                    updated_at: currentLevel.updatedAt,
                    alert_level: currentLevel.alertLevel.toString()
                } : null,
                cameras: stationCamera ? {
                    img_url: stationCamera.imgUrl,
                    jps_camera_id: stationCamera.jpsCameraId,
                    is_enabled: stationCamera.isEnabled
                } : null,
                normal_water_level: station.normalWaterLevel || 0,
                alert_water_level: station.alertWaterLevel || 0,
                warning_water_level: station.warningWaterLevel || 0,
                danger_water_level: station.dangerWaterLevel || 0,
                station_status: station.stationStatus
            };
        });
    },
});

// REMOVED: getStationsByDistrict (unreferenced anywhere).
// It returned raw station documents for a whole district, which means it
// published `gsmNumber` — the SIM/telephone number of the field telemetry
// hardware — plus `batteryLevel`, `mode` and `z1`/`z2`/`z3` device state.
// See the note on getStationById below.

// Optimized query for filtered stations by district with all details
// REMOVED: getStationsByDistrictWithDetails (unreferenced anywhere).
// Not a data-exposure issue (it hand-projected its fields), but dead code: the
// UI filters by district client-side via FilterContext. It also did a full
// `ctx.db.query("currentLevels").collect()` scan and then filtered in memory,
// so reviving it as-is would not scale.

// REMOVED: getStationById (unreferenced anywhere).
//
// It was a bare `ctx.db.get(stationId)`, so it returned the entire station
// document to any anonymous caller — including `gsmNumber`, the SIM/telephone
// number of the telemetry hardware. A phone number attached to unauthenticated
// flood-monitoring infrastructure is a direct target for SMS abuse and
// social engineering, and `batteryLevel`/`stationStatus` additionally let an
// attacker identify which sensors are already degraded.
//
// `getStationDetailById` below covers the same use case and hand-projects its
// output, so none of those fields are exposed. Any future single-station query
// must project fields explicitly rather than returning the document.

// Optimized query for station detail page - fetches only ONE station with all details
export const getStationDetailById = query({
    args: { stationId: v.id("stations") },
    handler: async (ctx, { stationId }) => {
        const station = await ctx.db.get(stationId);
        if (!station) return null;

        const district = await ctx.db.get(station.districtId);

        const currentLevel = await ctx.db
            .query("currentLevels")
            .withIndex("by_station", (q) => q.eq("stationId", stationId))
            .first();

        const stationCamera = await ctx.db
            .query("cameras")
            .withIndex("by_station", (q) => q.eq("stationId", stationId))
            .filter((q) => q.eq(q.field("isEnabled"), true))
            .first();

        return {
            id: station._id,
            station_name: station.stationName,
            districts: {
                name: district?.name || "Unknown"
            },
            current_levels: currentLevel ? {
                current_level: currentLevel.currentLevel,
                updated_at: currentLevel.updatedAt,
                alert_level: currentLevel.alertLevel.toString()
            } : null,
            cameras: stationCamera ? {
                img_url: stationCamera.imgUrl,
                jps_camera_id: stationCamera.jpsCameraId,
                is_enabled: stationCamera.isEnabled
            } : null,
            normal_water_level: station.normalWaterLevel || 0,
            alert_water_level: station.alertWaterLevel || 0,
            warning_water_level: station.warningWaterLevel || 0,
            danger_water_level: station.dangerWaterLevel || 0,
            station_status: station.stationStatus
        };
    },
});

export const getDistricts = query({
    handler: async (ctx) => {
        return await ctx.db.query("districts").collect();
    },
});

// REMOVED: getCameras (unreferenced anywhere).
// It returned every camera document, including ones with `isEnabled: false` —
// contradicting every other read path, which filters on the `by_enabled` index.
// Disabling a camera (e.g. one inadvertently overlooking private property) did
// not actually withhold it. Use `cameras.getCamerasWithDetails`, which filters.
