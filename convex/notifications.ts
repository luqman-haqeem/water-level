import { internalAction, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const ONE_HOUR_MS = 3600000;

export const getStationInfo = internalQuery({
  args: { stationId: v.id("stations") },
  handler: async (ctx, { stationId }) => {
    return await ctx.db.get(stationId);
  },
});

export const getRecentNotification = internalQuery({
  args: {
    userId: v.id("users"),
    stationId: v.id("stations"),
  },
  handler: async (ctx, { userId, stationId }) => {
    const cutoff = Date.now() - ONE_HOUR_MS;
    const recent = await ctx.db
      .query("notificationLog")
      .withIndex("by_user_station", (q) =>
        q.eq("userId", userId).eq("stationId", stationId)
      )
      .order("desc")
      .first();

    if (recent && recent.notifiedAt > cutoff) {
      return recent;
    }
    return null;
  },
});

export const getRecentStationNotification = internalQuery({
  args: {
    stationId: v.id("stations"),
  },
  handler: async (ctx, { stationId }) => {
    const cutoff = Date.now() - ONE_HOUR_MS;
    const recent = await ctx.db
      .query("notificationLog")
      .withIndex("by_station", (q) => q.eq("stationId", stationId))
      .order("desc")
      .first();

    if (recent && recent.notifiedAt > cutoff) {
      return recent;
    }
    return null;
  },
});

export const recordNotification = internalMutation({
  args: {
    userId: v.id("users"),
    stationId: v.id("stations"),
    alertLevel: v.number(),
  },
  handler: async (ctx, { userId, stationId, alertLevel }) => {
    await ctx.db.insert("notificationLog", {
      userId,
      stationId,
      notifiedAt: Date.now(),
      alertLevel,
    });
  },
});

/**
 * Records a station-level cooldown entry after a broadcast notification is sent.
 * This ensures the per-station cooldown works even when no users have favorited
 * the station (i.e., the per-user loop is a no-op). Without this, the cooldown
 * check would never find a record and every data sync detecting danger level
 * would fire a broadcast.
 */
export const recordStationCooldown = internalMutation({
  args: {
    stationId: v.id("stations"),
    alertLevel: v.number(),
  },
  handler: async (ctx, { stationId, alertLevel }) => {
    await ctx.db.insert("notificationLog", {
      stationId,
      notifiedAt: Date.now(),
      alertLevel,
    });
  },
});

export const notifyDangerForStation = internalAction({
  args: {
    stationId: v.id("stations"),
    currentLevel: v.number(),
    updatedAt: v.optional(v.string()),
  },
  handler: async (ctx, { stationId, currentLevel, updatedAt }) => {
    // Per-station cooldown: check if any notification was sent for this station
    // within the last hour, regardless of user
    const recentStationNotification = await ctx.runQuery(
      internal.notifications.getRecentStationNotification,
      { stationId }
    );

    if (recentStationNotification) {
      console.log(
        "Station on cooldown, skipping notification for station:",
        stationId
      );
      return;
    }

    // Get users who favorited this station
    const userIds = await ctx.runQuery(
      internal.favorites.getUsersWhoFavoritedStation,
      { stationId }
    );

    // Get station info for the notification message
    const station = await ctx.runQuery(internal.notifications.getStationInfo, {
      stationId,
    });

    if (!station) {
      console.error("Station not found:", stationId);
      return;
    }

    const stationName = station.stationName;

    // Record notification for each user who favorited (for future per-user targeting)
    for (const userId of userIds) {
      const recent = await ctx.runQuery(
        internal.notifications.getRecentNotification,
        { userId, stationId }
      );

      if (!recent) {
        await ctx.runMutation(internal.notifications.recordNotification, {
          userId,
          stationId,
          alertLevel: 3,
        });
      }
    }

    // Send push notification via OneSignal REST API.
    // NOTE: Broadcast scope is intentional for the current auth-less state.
    // "included_segments: ['Subscribed Users']" delivers to ALL push subscribers
    // regardless of which stations they have favorited. The favorites data is
    // scaffolding for future per-user targeting once authentication is added.
    // At that point, OneSignal data tags or include_aliases can be used to
    // target only users who favorited the specific station.
    const restApiKey = process.env.ONESIGNAL_REST_API_KEY;
    const appId = process.env.ONESIGNAL_APP_ID;
    const siteUrl = process.env.SITE_URL || "";

    if (!restApiKey || !appId) {
      console.error(
        "OneSignal environment variables not configured (ONESIGNAL_REST_API_KEY, ONESIGNAL_APP_ID)"
      );
      return;
    }

    // Build notification content, including updatedAt if provided
    let contentMessage = `Station ${stationName} has reached danger level (${currentLevel}m)`;
    if (updatedAt) {
      contentMessage += ` as of ${updatedAt}`;
    }

    try {
      const response = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          Authorization: `Key ${restApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          app_id: appId,
          included_segments: ["Subscribed Users"],
          headings: { en: "Danger Level Alert" },
          contents: {
            en: contentMessage,
          },
          url: `${siteUrl}/stations/${stationId}`,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          "OneSignal API error:",
          response.status,
          errorBody
        );
      } else {
        console.log(
          `Danger notification sent for station ${stationName} (level: ${currentLevel}m)`
        );

        // Record station-level cooldown unconditionally after a successful send.
        // This ensures the per-station cooldown check works even when no users
        // have favorited the station (the per-user loop would be a no-op).
        await ctx.runMutation(internal.notifications.recordStationCooldown, {
          stationId,
          alertLevel: 3,
        });
      }
    } catch (error) {
      console.error("Failed to send OneSignal notification:", error);
    }
  },
});
