import { query, internalMutation } from "./_generated/server";
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



/**
 * Cleans up old waterLevelSummaries records.
 * Keeps the last 24 hours (~96 records at 15-min intervals).
 * Without this, the table grows ~35K records/year unbounded.
 */
export const cleanupOldSummaries = internalMutation({
  handler: async (ctx) => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const BATCH_SIZE = 500;
    let totalDeleted = 0;

    const oldSummaries = await ctx.db
      .query("waterLevelSummaries")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", oneDayAgo))
      .take(BATCH_SIZE);

    if (oldSummaries.length === 0) {
      return { deletedCount: 0 };
    }

    await Promise.all(oldSummaries.map((doc) => ctx.db.delete(doc._id)));
    totalDeleted = oldSummaries.length;

    console.log(`🧹 Cleaned up ${totalDeleted} old waterLevelSummaries`);
    return { deletedCount: totalDeleted };
  },
});
