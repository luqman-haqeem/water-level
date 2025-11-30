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
}); export const getStationsByDistrict = query({
    args: { districtId: v.id("districts") },
    handler: async (ctx, { districtId }) => {
        return await ctx.db
            .query("stations")
            .withIndex("by_district", (q) => q.eq("districtId", districtId))
            .collect();
    },
});

// Optimized query for filtered stations by district with all details
export const getStationsByDistrictWithDetails = query({
    args: { districtId: v.id("districts") },
    handler: async (ctx, { districtId }) => {
        // Filter stations by district first
        const stations = await ctx.db
            .query("stations")
            .withIndex("by_district", (q) => q.eq("districtId", districtId))
            .collect();

        if (stations.length === 0) return [];

        // Get the district info (just 1 lookup since all stations are in same district)
        const district = await ctx.db.get(districtId);

        // Batch load current levels for these stations only
        const stationIds = stations.map(s => s._id);
        const allCurrentLevels = await ctx.db.query("currentLevels").collect();
        const levelMap = new Map(
            allCurrentLevels
                .filter(l => stationIds.includes(l.stationId))
                .map(l => [l.stationId, l])
        );

        // Batch load cameras for these stations only
        const allCameras = await ctx.db
            .query("cameras")
            .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
            .collect();
        const cameraMap = new Map(
            allCameras
                .filter(c => c.stationId !== undefined && stationIds.some(id => id === c.stationId))
                .map(c => [c.stationId!, c])
        );

        // Assemble results
        return stations.map(station => {
            const currentLevel = levelMap.get(station._id);
            const stationCamera = cameraMap.get(station._id);

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
        });
    },
});

export const getStationById = query({
    args: { stationId: v.id("stations") },
    handler: async (ctx, { stationId }) => {
        return await ctx.db.get(stationId);
    },
});

// Optimized query for station detail page - fetches only ONE station with all details
export const getStationDetailById = query({
    args: { stationId: v.id("stations") },
    handler: async (ctx, { stationId }) => {
        const station = await ctx.db.get(stationId);
        if (!station) return null;

        // Only 4 queries total instead of fetching ALL 40 stations!
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

export const getCameras = query({
    handler: async (ctx) => {
        return await ctx.db.query("cameras").collect();
    },
});