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

/**
 * Checks if a notification was recently sent for a specific station (per-station cooldown).
 * Used to prevent notification spam — only one notification per station per hour.
 */
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

/**
 * Records a station-level cooldown entry after a notification is sent.
 * This ensures the per-station cooldown works so that every data sync
 * detecting danger level does not fire repeated notifications.
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

/**
 * Builds the OneSignal notification payload using tag-based filters.
 * This is a pure function extracted for testability.
 */
export function buildNotificationPayload(args: {
  appId: string;
  stationId: string;
  stationName: string;
  currentLevel: number;
  siteUrl: string;
  updatedAt?: string;
}) {
  const { appId, stationId, stationName, siteUrl } = args;

  const contentMessage = `${stationName} has reached Danger level. Check the app for details.`;

  return {
    app_id: appId,
    filters: [
      {
        field: "tag" as const,
        key: `station_${stationId}`,
        value: "true",
        relation: "=" as const,
      },
    ],
    headings: { en: "Danger Level Alert" },
    contents: { en: contentMessage },
    url: `${siteUrl}/stations/${stationId}`,
  };
}

/**
 * Checks whether the required OneSignal environment variables are configured.
 * Returns true if notifications can be sent, false otherwise.
 */
export function shouldSendNotification(): boolean {
  const restApiKey = process.env.ONESIGNAL_REST_API_KEY;
  const appId = process.env.ONESIGNAL_APP_ID;
  return Boolean(restApiKey && appId);
}

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

    // Get station info for the notification message
    const station = await ctx.runQuery(internal.notifications.getStationInfo, {
      stationId,
    });

    if (!station) {
      console.error("Station not found:", stationId);
      return;
    }

    const stationName = station.stationName;

    // Validate environment configuration
    const restApiKey = process.env.ONESIGNAL_REST_API_KEY;
    const appId = process.env.ONESIGNAL_APP_ID;
    const siteUrl = process.env.SITE_URL || "";

    if (!restApiKey || !appId) {
      console.error(
        "OneSignal environment variables not configured (ONESIGNAL_REST_API_KEY, ONESIGNAL_APP_ID)"
      );
      return;
    }

    // Build the notification payload with tag-based targeting.
    // Users who subscribe to a station have a tag "station_{stationId}" set to "true"
    // via the OneSignal SDK on the frontend. The filters array targets only those users.
    const payload = buildNotificationPayload({
      appId,
      stationId,
      stationName,
      currentLevel,
      siteUrl,
      updatedAt,
    });

    try {
      const response = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          Authorization: `Key ${restApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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

        // Record station-level cooldown after a successful send.
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
