import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const ONE_HOUR_MS = 60 * 60 * 1000;

export const getStationForNotify = internalQuery({
    args: { stationId: v.id("stations") },
    handler: async (ctx, { stationId }) => {
        return await ctx.db.get(stationId);
    },
});

export const getRecentLog = internalQuery({
    args: {
        userId: v.id("users"),
        stationId: v.id("stations"),
        since: v.number(),
    },
    handler: async (ctx, { userId, stationId, since }) => {
        const latest = await ctx.db
            .query("notificationLog")
            .withIndex("by_user_station", (q) =>
                q.eq("userId", userId).eq("stationId", stationId)
            )
            .order("desc")
            .first();
        if (!latest) return null;
        return latest.notifiedAt >= since ? latest : null;
    },
});

export const recordSend = internalMutation({
    args: {
        userId: v.id("users"),
        stationId: v.id("stations"),
    },
    handler: async (ctx, { userId, stationId }) => {
        await ctx.db.insert("notificationLog", {
            userId,
            stationId,
            notifiedAt: Date.now(),
            alertLevel: 3,
        });
    },
});

export const notifyDangerForStation = internalAction({
    args: {
        stationId: v.id("stations"),
        currentLevel: v.number(),
        updatedAt: v.optional(v.string()),
    },
    handler: async (ctx, { stationId, currentLevel }) => {
        const restKey = process.env.ONESIGNAL_REST_API_KEY;
        const appId = process.env.ONESIGNAL_APP_ID;
        if (!restKey || !appId) {
            console.warn(
                "OneSignal not configured server-side (missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY); skipping push"
            );
            return;
        }

        const station = await ctx.runQuery(internal.notifications.getStationForNotify, {
            stationId,
        });
        if (!station) {
            console.warn(`notifyDangerForStation: station ${stationId} not found`);
            return;
        }

        const userIds = await ctx.runQuery(
            internal.favorites.getUsersWhoFavoritedStation,
            { stationId }
        );
        if (userIds.length === 0) return;

        const since = Date.now() - ONE_HOUR_MS;
        const siteUrl = process.env.SITE_URL ?? "";
        const dangerLevel = station.dangerWaterLevel;
        const dangerSuffix =
            typeof dangerLevel === "number" ? ` (danger threshold ${dangerLevel}m)` : "";

        for (const userId of userIds) {
            const recent = await ctx.runQuery(internal.notifications.getRecentLog, {
                userId,
                stationId,
                since,
            });
            if (recent) continue;

            const res = await fetch("https://api.onesignal.com/notifications", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Key ${restKey}`,
                },
                body: JSON.stringify({
                    app_id: appId,
                    target_channel: "push",
                    include_aliases: { external_id: [userId] },
                    headings: { en: `Danger level: ${station.stationName}` },
                    contents: {
                        en: `Water level ${currentLevel}m has reached danger${dangerSuffix}.`,
                    },
                    web_url: `${siteUrl}/stations/${stationId}`,
                    data: { stationId, alertLevel: 3, currentLevel },
                }),
            });

            if (!res.ok) {
                const body = await res.text().catch(() => "");
                console.error(
                    `OneSignal send failed for user ${userId}: ${res.status} ${body}`
                );
                continue;
            }

            await ctx.runMutation(internal.notifications.recordSend, {
                userId,
                stationId,
            });
        }
    },
});
