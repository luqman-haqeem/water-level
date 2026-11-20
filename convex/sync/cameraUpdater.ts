import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

export const updateCameras = internalAction({
  handler: async (ctx): Promise<{
    success: boolean;
    camerasCount: number;
    timestamp: string;
  }> => {
    try {
      console.log('📹 Starting automated camera data sync...');
      
      // Get all districts
      const districts = await ctx.runMutation(internal.sync.cameraUpdater.getDistricts);
      let totalCamerasUpdated = 0;
      
      // JPS must be fetched from the Node runtime (see sync/jpsFetch.ts), and in
      // parallel: at 15-30s per request a serial loop risks the action limit.
      const responses = await Promise.allSettled(
        districts.map((district) =>
          district.jpsDistrictsId
            ? ctx.runAction(internal.sync.jpsFetch.fetchJson, {
                path: `/CCTVS/GetCCTVsByDistrict/${district.jpsDistrictsId}`,
              })
            : Promise.resolve(null)
        )
      );

      for (const [index, district] of districts.entries()) {
        try {
          // Skip districts without jpsDistrictsId
          if (!district.jpsDistrictsId) {
            console.warn(`District ${district.name} has no jpsDistrictsId, skipping`);
            continue;
          }
          
          const response = responses[index];
          if (response.status === 'rejected') {
            console.warn(`❌ Failed to fetch cameras for district ${district.name}:`, response.reason);
          }
          const camerasJPS = response.status === 'fulfilled' ? response.value : null;
          
          if (!camerasJPS || !Array.isArray(camerasJPS)) {
            console.warn(`No camera data found for district ${district.name}`);
            continue;
          }
          console.log(`✅ Found ${camerasJPS.length} cameras for district ${district.name}`);
        
          for (const cameraJPS of camerasJPS) {
            await ctx.runMutation(internal.sync.cameraUpdater.upsertCamera, {
              districtId: district._id,
              cameraData: {
                jpsCameraId: cameraJPS.id.toString(),
                cameraBrand: cameraJPS.cameraBrand || '',
                cameraName: cameraJPS.cameraName || `Camera ${cameraJPS.id}`,
                imgUrl: cameraJPS.imageUrl || '',
                isEnabled: cameraJPS.isEnabled ?? true,
                isOnline: cameraJPS.isOnline ?? true,
                latitude: parseFloat(cameraJPS.latitude) || 0,
                longitude: parseFloat(cameraJPS.longitude) || 0,
                mainBasin: cameraJPS.mainRiverBasin || '',
                subBasin: cameraJPS.subRiverBasin || '',
              }
            });
            totalCamerasUpdated++;
          }
        } catch (error) {
          console.warn(`Failed to process district ${district._id}: ${error}`);
        }
      }
      
      const timestamp = new Date().toISOString();
      console.log(`✅ Camera sync complete: ${totalCamerasUpdated} cameras processed`);
      
      return {
        success: true,
        camerasCount: totalCamerasUpdated,
        timestamp,
      };
      
    } catch (error) {
      console.error('❌ Camera sync failed:', error);
      throw error;
    }
  },
});

export const getDistricts = internalMutation({
  handler: async (ctx) => {
    return await ctx.db.query("districts").collect();
  },
});

// REMOVED, matching main (#68/#71): createCamera and getCameras.
// `createCamera` was a public passthrough to `upsertCamera` below, which is an
// insert-OR-patch keyed on a caller-supplied `jpsCameraId` — so it allowed
// anonymous overwrite of any camera record, including flipping `isEnabled` to
// hide a camera from every client. `getCameras` was an unused debug read.

export const upsertCamera = internalMutation({
  args: {
    districtId: v.id("districts"),
    cameraData: v.object({
      jpsCameraId: v.string(),
      cameraBrand: v.optional(v.string()),
      cameraName: v.string(),
      imgUrl: v.optional(v.string()),
      isEnabled: v.boolean(),
      isOnline: v.optional(v.boolean()),
      latitude: v.optional(v.number()),
      longitude: v.optional(v.number()),
      mainBasin: v.optional(v.string()),
      subBasin: v.optional(v.string()),
    })
  },
  handler: async (ctx, { districtId, cameraData }) => {
    // Check if camera exists
    const existing = await ctx.db
      .query("cameras")
      .withIndex("by_jps_camera_id", (q) => q.eq("jpsCameraId", cameraData.jpsCameraId))
      .first();
    
    if (existing) {
      // Update existing camera
      await ctx.db.patch(existing._id, {
        ...cameraData,
        districtId,
      });
    } else {
      // Insert new camera
      await ctx.db.insert("cameras", {
        ...cameraData,
        districtId,
      });
    }
  },
});