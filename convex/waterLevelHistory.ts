import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { TRENDS_WINDOW_MS } from "./lib/retention";

// Trend data for a station over the published window.
//
// NOTE: rows now outlive this window (retention is HISTORY_RETENTION_MS, see
// lib/retention.ts), so this bound is what makes the query cheap rather than an
// artefact of everything older having been deleted. Any future caller wanting a
// longer window should take it as an argument (#80) rather than widening this.
export const getStationTrend = query({
  args: { stationId: v.id("stations") },
  handler: async (ctx, { stationId }) => {
    const since = Date.now() - TRENDS_WINDOW_MS;

    return await ctx.db
      .query("waterLevelHistory")
      .withIndex("by_station_time", (q) =>
        q.eq("stationId", stationId).gte("timestamp", since)
      )
      .order("asc")
      .collect();
  }
});

export interface TrendPoint {
    timestamp: number;
    currentLevel: number;
    alertLevel: number;
    recordedAt: string;
}

/**
 * All stations' history over the published window, in one indexed pass, grouped
 * by station id. Used by the snapshot publisher to build trends.json.
 *
 * This is an indexed range scan on by_timestamp, so its cost is proportional to
 * the window, not to the size of the table. Retaining history for longer (#80)
 * therefore does not make publishing more expensive.
 */
export const getAllTrends = internalQuery({
    handler: async (ctx): Promise<Record<string, TrendPoint[]>> => {
        const since = Date.now() - TRENDS_WINDOW_MS;
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

// REMOVED by #72: getMultipleStationsTrend (unreferenced anywhere).
// It took an unbounded `v.array(v.id("stations"))` and ran one full `.collect()`
// per element in a sequential loop, with no length cap and no de-duplication —
// so a single anonymous request repeating one valid id 10,000 times multiplied
// document reads by 10,000. If a batch variant is needed later, cap the array
// length, de-duplicate it, and `.take(n)` each per-station read.
