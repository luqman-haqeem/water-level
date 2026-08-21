import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getUsersWhoFavoritedStation = internalQuery({
  args: { stationId: v.id("stations") },
  handler: async (ctx, { stationId }) => {
    const favorites = await ctx.db
      .query("favoriteStations")
      .withIndex("by_station", (q) => q.eq("stationId", stationId))
      .collect();

    return favorites.map((f) => f.userId);
  },
});
