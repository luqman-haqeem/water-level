import { action, internalMutation, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

export const updateCameras = action({
  handler: async (ctx): Promise<{
    success: boolean;
    camerasCount: number;
    timestamp: string;
  }> => {
    const BASE_URL = 'https://infobanjirjps.selangor.gov.my/JPSAPI/api';

    try {
      console.log('📹 Starting automated camera data sync...');
      
      // Get all districts
      const districts = await ctx.runMutation(internal.sync.cameraUpdater.getDistricts);
      let totalCamerasUpdated = 0;
      
      for (const district of districts) {
        try {
          // Skip districts without jpsDistrictsId
          if (!district.jpsDistrictsId) {
            console.warn(`District ${district.name} has no jpsDistrictsId, skipping`);
            continue;
          }
          
          let response;
          let camerasJPS = [];
          
          const endpoint = `${BASE_URL}/CCTVS/GetCCTVsByDistrict/${district.jpsDistrictsId}`;
          
          try {
            console.log(`📹 Fetching cameras from: ${endpoint}`);
            response = await fetch(endpoint);
            if (response.ok) {
              camerasJPS = await response.json();
              console.log(`✅ Found ${camerasJPS.length || 0} cameras for district ${district.name}`);
            } else {
              console.warn(`❌ Camera API returned ${response.status} for district ${district.name}`);
            }
          } catch (error) {
            console.warn(`❌ Failed to fetch cameras for district ${district.name}:`, error);
          }
          
          if (!response || !response.ok || !camerasJPS || !Array.isArray(camerasJPS)) {
            console.warn(`No camera data found for district ${district.name}`);
            continue;
          }
        
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

export const getCameras = internalMutation({
  handler: async (ctx) => {
    return await ctx.db.query("cameras").take(5);
  },
});

export const createCamera = mutation({
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
  handler: async (ctx, { districtId, cameraData }): Promise<void> => {
    await ctx.runMutation(internal.sync.cameraUpdater.upsertCamera, {
      districtId,
      cameraData
    });
  },
});

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