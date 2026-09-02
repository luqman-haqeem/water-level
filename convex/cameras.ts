import { query } from "./_generated/server";

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
        districts: {
          name: district?.name || "Unknown"
        }
      };
    });
  },
});

// REMOVED (unreferenced anywhere in src/, netlify/, scripts/ or convex/):
//   getCamerasByDistrict, getCameraById, getCamerasByStation
// All three returned raw camera documents via `ctx.db.get`/`.collect()` with no
// field projection. `getCamerasWithDetails` above hand-picks the fields the UI
// needs, which is the pattern every public query should follow.
