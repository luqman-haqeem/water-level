import { action, internalMutation, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

export const updateStations = action({
  handler: async (ctx) => {
    const stationURL = process.env.STATION_URL;
    
    if (!stationURL) {
      throw new Error('STATION_URL environment variable is not set');
    }

    try {
      // Get all districts
      const districts = await ctx.runMutation(internal.sync.stationUpdater.getDistricts);
      
      for (const district of districts) {
        const response = await fetch(`${stationURL}${district._id}`);
        if (!response.ok) {
          throw new Error(`Network response was not ok for district ${district._id}`);
        }
        
        const stationsJps = await response.json();
        if (!stationsJps || !stationsJps.stations) continue;
        
        for (const stationJps of stationsJps.stations) {
          await ctx.runMutation(internal.sync.stationUpdater.upsertStation, {
            districtId: district._id,
            stationData: {
              jpsSelId: stationJps.id,
              publicInfoId: stationJps.stationId,
              stationName: stationJps.stationName,
              stationCode: stationJps.stationCode,
              refName: stationJps.referenceName,
              latitude: stationJps.latitude,
              longitude: stationJps.longitude,
              gsmNumber: stationJps.gsmNumber,
              normalWaterLevel: stationJps.wlth_normal,
              alertWaterLevel: stationJps.wlth_alert,
              warningWaterLevel: stationJps.wlth_warning,
              dangerWaterLevel: stationJps.wlth_danger,
              stationStatus: stationJps.stationStatus,
              mode: stationJps.mode,
              z1: stationJps.z1,
              z2: stationJps.z2,
              z3: stationJps.z3,
              batteryLevel: stationJps.batteryLevel,
            }
          });
        }
      }
      
      console.log('Stations updated successfully.');
    } catch (error) {
      console.error('Error updating station info:', error);
      throw error;
    }
  },
});

export const getDistricts = internalMutation({
  handler: async (ctx) => {
    return await ctx.db.query("districts").collect();
  },
});

export const insertDistrict = internalMutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    return await ctx.db.insert("districts", { name });
  },
});

// Public mutation for seeding/manual district insertion

export const createDistrict = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    // Check if district already exists
    const existing = await ctx.db
      .query("districts")
      .filter((q) => q.eq(q.field("name"), name))
      .first();
    
    if (existing) {
      throw new Error(`District "${name}" already exists`);
    }
    
    return await ctx.db.insert("districts", { name });
  },
});

export const getAllDistricts = mutation({
  handler: async (ctx) => {
    return await ctx.db.query("districts").collect();
  },
});

export const createStation = mutation({
  args: { 
    districtId: v.id("districts"),
    stationData: v.object({
      jpsSelId: v.string(),
      publicInfoId: v.optional(v.string()),
      stationName: v.string(),
      stationCode: v.optional(v.string()),
      refName: v.optional(v.string()),
      latitude: v.optional(v.number()),
      longitude: v.optional(v.number()),
      gsmNumber: v.optional(v.string()),
      normalWaterLevel: v.optional(v.number()),
      alertWaterLevel: v.optional(v.number()),
      warningWaterLevel: v.optional(v.number()),
      dangerWaterLevel: v.optional(v.number()),
      stationStatus: v.boolean(),
      mode: v.optional(v.string()),
      z1: v.optional(v.number()),
      z2: v.optional(v.number()),
      z3: v.optional(v.number()),
      batteryLevel: v.optional(v.number()),
    })
  },
  handler: async (ctx, { districtId, stationData }): Promise<void> => {
    await ctx.runMutation(internal.sync.stationUpdater.upsertStation, {
      districtId,
      stationData
    });
  },
});

export const upsertStation = internalMutation({
  args: { 
    districtId: v.id("districts"),
    stationData: v.object({
      jpsSelId: v.string(),
      publicInfoId: v.optional(v.string()),
      stationName: v.string(),
      stationCode: v.optional(v.string()),
      refName: v.optional(v.string()),
      latitude: v.optional(v.number()),
      longitude: v.optional(v.number()),
      gsmNumber: v.optional(v.string()),
      normalWaterLevel: v.optional(v.number()),
      alertWaterLevel: v.optional(v.number()),
      warningWaterLevel: v.optional(v.number()),
      dangerWaterLevel: v.optional(v.number()),
      stationStatus: v.boolean(),
      mode: v.optional(v.string()),
      z1: v.optional(v.number()),
      z2: v.optional(v.number()),
      z3: v.optional(v.number()),
      batteryLevel: v.optional(v.number()),
    })
  },
  handler: async (ctx, { districtId, stationData }) => {
    // Check if station exists
    const existing = await ctx.db
      .query("stations")
      .withIndex("by_jps_sel_id", (q) => q.eq("jpsSelId", stationData.jpsSelId))
      .first();
    
    if (existing) {
      // Update existing station
      await ctx.db.patch(existing._id, {
        ...stationData,
        districtId,
      });
    } else {
      // Insert new station
      await ctx.db.insert("stations", {
        ...stationData,
        districtId,
      });
    }
  },
});