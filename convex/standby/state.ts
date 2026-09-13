import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

const KEY = "publisher";

/** Liveness of the standby publisher: written every cycle, whether or not it published. */
export const recordHeartbeat = internalMutation({
    args: {
        checkedAt: v.string(),
        reason: v.string(),
        published: v.boolean(),
        snapshotAgeMs: v.optional(v.number()),
    },
    handler: async (ctx, { checkedAt, reason, published, snapshotAgeMs }) => {
        const existing = await ctx.db
            .query("standbyState")
            .withIndex("by_key", (q) => q.eq("key", KEY))
            .first();

        const patch = {
            key: KEY,
            lastCheckedAt: checkedAt,
            lastReason: reason,
            lastSnapshotAgeMs: snapshotAgeMs,
            // Preserved across stand-down cycles, so the last real failover stays visible.
            lastPublishedAt: published ? checkedAt : existing?.lastPublishedAt,
        };

        if (existing) await ctx.db.patch(existing._id, patch);
        else await ctx.db.insert("standbyState", patch);
    },
});

/** Read the heartbeat: `npx convex run standby/state:get` answers "is the backup armed?" */
export const get = internalQuery({
    args: {},
    handler: async (ctx) =>
        await ctx.db
            .query("standbyState")
            .withIndex("by_key", (q) => q.eq("key", KEY))
            .first(),
});
