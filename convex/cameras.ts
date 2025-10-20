import { query } from "./_generated/server";
import { v } from "convex/values";

export const getCamerasWithDetails = query({
  handler: async (ctx) => {
    // Single query for all enabled cameras
    const cameras = await ctx.db
      .query("cameras")
      .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
      .collect();

    // Batch load all districts at once
    const districtIds = Array.from(new Set(cameras.map(c => c.districtId)));
    const districts = await Promise.all(
      districtIds.map(id => ctx.db.get(id))
    );
    const districtMap = new Map(
      districts.filter(Boolean).map(d => [d!._id, d!])
    );

    // Assemble results with lookups (no additional queries!)
    return cameras.map(camera => {
      const district = districtMap.get(camera.districtId);

      return {
        id: camera._id,
        camera_name: camera.cameraName,
        img_url: camera.imgUrl,
        jps_camera_id: camera.jpsCameraId,
        districts: {
          name: district?.name || "Unknown"
        }
      };
    });
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