import { query } from "./_generated/server";
import { v } from "convex/values";

export const getStationsWithDetails = query({
  handler: async (ctx) => {
    const stations = await ctx.db.query("stations").collect();
    
    const stationsWithDetails = await Promise.all(
      stations.map(async (station) => {
        // Get district
        const district = await ctx.db.get(station.districtId);
        
        // Get current levels
        const currentLevel = await ctx.db
          .query("currentLevels")
          .withIndex("by_station", (q) => q.eq("stationId", station._id))
          .first();
        
        // Get camera for this station using proper relationship
        const stationCamera = await ctx.db
          .query("cameras")
          .withIndex("by_station", (q) => q.eq("stationId", station._id))
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
      })
    );
    
    return stationsWithDetails;
  },
});

export const getStationsByDistrict = query({
  args: { districtId: v.id("districts") },
  handler: async (ctx, { districtId }) => {
    return await ctx.db
      .query("stations")
      .withIndex("by_district", (q) => q.eq("districtId", districtId))
      .collect();
  },
});

export const getStationById = query({
  args: { stationId: v.id("stations") },
  handler: async (ctx, { stationId }) => {
    return await ctx.db.get(stationId);
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