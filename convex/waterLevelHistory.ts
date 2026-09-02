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

// REMOVED: getMultipleStationsTrend (unreferenced anywhere).
// It took an unbounded `v.array(v.id("stations"))` and ran one full `.collect()`
// per element in a sequential loop, with no length cap and no de-duplication —
// so a single anonymous request repeating one valid id 10,000 times multiplied
// document reads by 10,000. If a batch variant is needed later, cap the array
// length, de-duplicate it, and `.take(n)` each per-station read.
