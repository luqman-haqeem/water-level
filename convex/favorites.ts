import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

export const addFavoriteStation = mutation({
  args: { stationId: v.id("stations") },
  handler: async (ctx, { stationId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    
    // Check if favorite already exists
    const existing = await ctx.db
      .query("favoriteStations")
      .withIndex("by_user_station", (q) => q.eq("userId", userId).eq("stationId", stationId))
      .first();
    
    if (existing) {
      throw new Error("Station already in favorites");
    }
    
    await ctx.db.insert("favoriteStations", {
      userId,
      stationId,
    });
  },
});

export const removeFavoriteStation = mutation({
  args: { stationId: v.id("stations") },
  handler: async (ctx, { stationId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    
    const existing = await ctx.db
      .query("favoriteStations")
      .withIndex("by_user_station", (q) => q.eq("userId", userId).eq("stationId", stationId))
      .first();
    
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const addFavoriteCamera = mutation({
  args: { cameraId: v.id("cameras") },
  handler: async (ctx, { cameraId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    
    // Check if favorite already exists
    const existing = await ctx.db
      .query("favoriteCameras")
      .withIndex("by_user_camera", (q) => q.eq("userId", userId).eq("cameraId", cameraId))
      .first();
    
    if (existing) {
      throw new Error("Camera already in favorites");
    }
    
    await ctx.db.insert("favoriteCameras", {
      userId,
      cameraId,
    });
  },
});

export const removeFavoriteCamera = mutation({
  args: { cameraId: v.id("cameras") },
  handler: async (ctx, { cameraId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    
    const existing = await ctx.db
      .query("favoriteCameras")
      .withIndex("by_user_camera", (q) => q.eq("userId", userId).eq("cameraId", cameraId))
      .first();
    
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const getFavoriteStations = query({
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return [];
    }
    
    const favorites = await ctx.db
      .query("favoriteStations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    
    return favorites.map(fav => fav.stationId);
  },
});

export const getFavoriteCameras = query({
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return [];
    }
    
    const favorites = await ctx.db
      .query("favoriteCameras")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    
    return favorites.map(fav => fav.cameraId);
  },
});