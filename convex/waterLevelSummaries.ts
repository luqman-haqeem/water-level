import { query } from "./_generated/server";
import { v } from "convex/values";

export const getRecentSummaries = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 10 }) => {
    return await ctx.db
      .query("waterLevelSummaries")
      .withIndex("by_timestamp")
      .order("desc")
      .take(limit);
  },
});

export const getLatestSummary = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("waterLevelSummaries")
      .withIndex("by_timestamp")
      .order("desc")
      .first();
  },
});