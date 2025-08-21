import { query } from "./_generated/server";
import { v } from "convex/values";

export const getCamerasWithDetails = query({
  handler: async (ctx) => {
    const cameras = await ctx.db
      .query("cameras")
      .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
      .collect();
    
    const camerasWithDetails = await Promise.all(
      cameras.map(async (camera) => {
        // Get district
        const district = await ctx.db.get(camera.districtId);
        
        return {
          id: camera._id,
          camera_name: camera.cameraName,
          img_url: camera.imgUrl,
          jps_camera_id: camera.jpsCameraId,
          districts: {
            name: district?.name || "Unknown"
          }
        };
      })
    );
    
    return camerasWithDetails;
  },
});

export const getCamerasByDistrict = query({
  args: { districtId: v.id("districts") },
  handler: async (ctx, { districtId }) => {
    return await ctx.db
      .query("cameras")
      .withIndex("by_district", (q) => q.eq("districtId", districtId))
      .filter((q) => q.eq(q.field("isEnabled"), true))
      .collect();
  },
});

export const getCameraById = query({
  args: { cameraId: v.id("cameras") },
  handler: async (ctx, { cameraId }) => {
    return await ctx.db.get(cameraId);
  },
});

export const getCamerasByStation = query({
  args: { stationId: v.id("stations") },
  handler: async (ctx, { stationId }) => {
    return await ctx.db
      .query("cameras")
      .withIndex("by_station", (q) => q.eq("stationId", stationId))
      .filter((q) => q.eq(q.field("isEnabled"), true))
      .collect();
  },
});