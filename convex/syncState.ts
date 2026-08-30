import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const get = internalQuery({
    args: { key: v.string() },
    handler: async (ctx, { key }) => {
        return await ctx.db
            .query("syncState")
            .withIndex("by_key", (q) => q.eq("key", key))
            .first();
    },
});

/**
 * Upserts the single sync-state row for `key`.
 * - status "ok": clears failingSince/lastError; syncedAt should be the run time
 *   when data changed, or the previous lastSyncedAt when nothing changed.
 * - status "upstream_error": keeps the earliest failingSince of the current outage.
 */
export const record = internalMutation({
    args: {
        key: v.string(),
        attemptedAt: v.string(),
        status: v.union(v.literal("ok"), v.literal("upstream_error")),
        fingerprint: v.optional(v.string()),
        jpsLastUpdate: v.optional(v.string()),
        syncedAt: v.optional(v.string()),
        error: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("syncState")
            .withIndex("by_key", (q) => q.eq("key", args.key))
            .first();

        const failingSince =
            args.status === "upstream_error"
                ? existing?.failingSince ?? args.attemptedAt
                : undefined;

        const next = {
            key: args.key,
            lastJpsFingerprint: args.fingerprint ?? existing?.lastJpsFingerprint,
            lastJpsUpdate: args.jpsLastUpdate ?? existing?.lastJpsUpdate,
            lastSyncedAt: args.syncedAt ?? existing?.lastSyncedAt,
            lastAttemptAt: args.attemptedAt,
            lastStatus: args.status,
            failingSince,
            lastError: args.status === "upstream_error" ? args.error : undefined,
        };

        if (existing) {
            await ctx.db.replace(existing._id, next);
            return existing._id;
        }
        return await ctx.db.insert("syncState", next);
    },
});
