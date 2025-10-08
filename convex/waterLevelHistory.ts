import { query } from "./_generated/server";
import { v } from "convex/values";

// Get past 3 hours trend data for a station
export const getStationTrend = query({
  args: { stationId: v.id("stations") },
  handler: async (ctx, { stationId }) => {
    const threeHoursAgo = Date.now() - (3 * 60 * 60 * 1000); // 3 hours in ms
    
    return await ctx.db
      .query("waterLevelHistory")
      .withIndex("by_station_time", (q) => 
        q.eq("stationId", stationId).gte("timestamp", threeHoursAgo)
      )
      .order("asc")
      .collect();
  }
});

// Get all trend data for multiple stations (for efficient batch loading)
export const getMultipleStationsTrend = query({
  args: { stationIds: v.array(v.id("stations")) },
  handler: async (ctx, { stationIds }) => {
    const threeHoursAgo = Date.now() - (3 * 60 * 60 * 1000);
    
    const trendsMap: Record<string, any[]> = {};
    
    for (const stationId of stationIds) {
      const trend = await ctx.db
        .query("waterLevelHistory")
        .withIndex("by_station_time", (q) => 
          q.eq("stationId", stationId).gte("timestamp", threeHoursAgo)
        )
        .order("asc")
        .collect();
      
      trendsMap[stationId] = trend;
    }
    
    return trendsMap;
  }
});