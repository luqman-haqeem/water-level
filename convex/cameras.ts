import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getCamerasWithDetails = query({
  handler: async (ctx) => {
    // Single query for all enabled cameras
    const cameras = await ctx.db
      .query("cameras")
      .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
      .collect();

    // Batch load all districts at once
    const districtIds = Array.from(new Set(cameras.map(c => c.districtId)));
    const districts = await Promise.all(
      districtIds.map(id => ctx.db.get(id))
    );
    const districtMap = new Map(
      districts.filter(Boolean).map(d => [d!._id, d!])
    );

    // Assemble results with lookups (no additional queries!)
    return cameras.map(camera => {
      const district = districtMap.get(camera.districtId);

      return {
        id: camera._id,
        camera_name: camera.cameraName,
        img_url: camera.imgUrl,
        jps_camera_id: camera.jpsCameraId,
        captured_at: camera.lastImageAt ?? null,
        districts: {
          name: district?.name || "Unknown"
        }
      };
    });
  },
});

// REMOVED by #72 (unreferenced anywhere in src/, netlify/, scripts/ or convex/):
//   getCamerasByDistrict, getCameraById, getCamerasByStation
// All three returned raw camera documents via `ctx.db.get`/`.collect()` with no
// field projection. `getCamerasWithDetails` above hand-picks the fields the UI
// needs, which is the pattern every public query should follow.

/**
 * Cameras to mirror. "all" = every enabled camera; "alert" = only cameras whose
 * linked station is currently at alert level or above (refreshed more often).
 *
 * internalQuery, not query: this is only ever called by the image-sync action.
 */
export const listForImageSync = internalQuery({
  args: { tier: v.union(v.literal("all"), v.literal("alert")) },
  handler: async (ctx, { tier }) => {
    const cameras = await ctx.db
      .query("cameras")
      .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
      .collect();

    let selected = cameras;
    if (tier === "alert") {
      const levels = await ctx.db.query("currentLevels").collect();
      const elevated = new Set(
        levels.filter((l) => l.alertLevel >= 1).map((l) => l.stationId)
      );
      selected = cameras.filter((c) => c.stationId !== undefined && elevated.has(c.stationId));
    }

    return selected.map((c) => ({ _id: c._id, jpsCameraId: c.jpsCameraId }));
  },
});

export const setLastImageAt = internalMutation({
  args: { cameraId: v.id("cameras"), capturedAt: v.string() },
  handler: async (ctx, { cameraId, capturedAt }) => {
    await ctx.db.patch(cameraId, { lastImageAt: capturedAt });
  },
});
