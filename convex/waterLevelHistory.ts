import { query, internalQuery } from "./_generated/server";
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

export interface TrendPoint {
    timestamp: number;
    currentLevel: number;
    alertLevel: number;
    recordedAt: string;
}

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

/**
 * All stations' last-3h history in one indexed pass, grouped by station id.
 * Used by the snapshot publisher to build trends.json.
 */
export const getAllTrends = internalQuery({
    handler: async (ctx): Promise<Record<string, TrendPoint[]>> => {
        const since = Date.now() - THREE_HOURS_MS;
        const rows = await ctx.db
            .query("waterLevelHistory")
            .withIndex("by_timestamp", (q) => q.gte("timestamp", since))
            .order("asc")
            .collect();

        const trends: Record<string, TrendPoint[]> = {};
        for (const row of rows) {
            const key = row.stationId as string;
            (trends[key] ??= []).push({
                timestamp: row.timestamp,
                currentLevel: row.currentLevel,
                alertLevel: row.alertLevel,
                recordedAt: row.recordedAt,
            });
        }
        return trends;
    },
});