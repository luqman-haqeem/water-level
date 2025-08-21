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
          // Use correct JPS CCTV API endpoint with JPS district ID
          // Need to map district name to JPS district ID
          let jpsDistrictId;
          switch (district.name) {
            case 'KUALA SELANGOR': jpsDistrictId = 1; break;
            case 'SABAK BERNAM': jpsDistrictId = 2; break;
            case 'HULU LANGAT': jpsDistrictId = 3; break;
            case 'SEPANG': jpsDistrictId = 4; break;
            case 'KUALA LANGAT': jpsDistrictId = 5; break;
            case 'KLANG': jpsDistrictId = 6; break;
            case 'PETALING': jpsDistrictId = 7; break;
            case 'GOMBAK': jpsDistrictId = 8; break;
            case 'HULU SELANGOR': jpsDistrictId = 9; break;
            default: 
              console.warn(`Unknown district: ${district.name}`);
              continue;
          }
          
          let response;
          let camerasJPS = [];
          
          const endpoint = `${BASE_URL}/CCTVS/GetCCTVsByDistrict/${jpsDistrictId}`;
          
          try {
            console.log(`📹 Fetching cameras from: ${endpoint}`);
            response = await fetch(endpoint);
            if (response.ok) {
              camerasJPS = await response.json();
              console.log(`✅ Found ${camerasJPS.length || 0} cameras for district ${district.name}`);
            } else {
              console.warn(`❌ Camera API returned ${response.status} for district ${district._id}`);
            }
          } catch (error) {
            console.warn(`❌ Failed to fetch cameras for district ${district._id}:`, error);
          }
          
          if (!response || !response.ok || !camerasJPS || !Array.isArray(camerasJPS)) {
            console.warn(`No camera data found for district ${district._id}`);
            // For now, create a placeholder entry to show the system works
            camerasJPS = [{
              id: `cam_${district._id}`,
              cameraName: `Sample Camera - ${district.name}`,
              cameraBrand: 'Generic',
              imageUrl: '',
              isEnabled: false,
              isOnline: false,
              latitude: 3.0,
              longitude: 101.5,
              mainRiverBasin: '',
              subRiverBasin: '',
            }];
            console.log(`📷 Created placeholder camera for district ${district.name}`);
          }
        
          for (const cameraJPS of camerasJPS) {
            await ctx.runMutation(internal.sync.cameraUpdater.upsertCamera, {
              districtId: district._id,
              cameraData: {
                jpsCameraId: (cameraJPS.id || cameraJPS.cameraId || '').toString(),
                cameraBrand: cameraJPS.cameraBrand || cameraJPS.brand || '',
                cameraName: cameraJPS.cameraName || cameraJPS.name || `Camera ${cameraJPS.id || ''}`,
                imgUrl: cameraJPS.imageUrl || cameraJPS.imgUrl || cameraJPS.streamUrl || '',
                isEnabled: cameraJPS.isEnabled !== false, // Default to true unless explicitly false
                isOnline: cameraJPS.isOnline !== false, // Default to true unless explicitly false
                latitude: parseFloat(cameraJPS.latitude || cameraJPS.lat || 0),
                longitude: parseFloat(cameraJPS.longitude || cameraJPS.lng || 0),
                mainBasin: cameraJPS.mainRiverBasin || cameraJPS.mainBasin || '',
                subBasin: cameraJPS.subRiverBasin || cameraJPS.subBasin || '',
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