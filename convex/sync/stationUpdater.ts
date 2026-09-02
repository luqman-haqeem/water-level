import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

/**
 * Drops keys whose value is `undefined`.
 *
 * A Convex `db.patch` treats an explicit `undefined` as "delete this field", so
 * spreading a payload built from an upstream response that omitted a field will
 * DESTROY the stored value rather than leave it alone. JPS omits fields
 * routinely — lat/lng were removed from their API entirely — so a blind patch
 * here silently wipes last-known-good station metadata.
 *
 * `waterLevelData.upsertStation` already guards its coordinate writes for this
 * reason; this generalises the same rule for the weekly metadata sync.
 */
export function omitUndefined<T extends Record<string, unknown>>(
  fields: T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

/**
 * Normalises a JPS coordinate to a usable number, or `undefined` if absent.
 *
 * Treats `0` as absent: JPS uses it as a null sentinel, and 0,0 is in the Gulf
 * of Guinea, not Selangor. Note the string case matters — `"0"` is truthy, so a
 * bare `raw ? parseFloat(raw) : undefined` lets a sentinel `"0"` through as a
 * real coordinate and overwrite a good value.
 */
export function parseCoordinate(raw: unknown): number | undefined {
  const parsed =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? parseFloat(raw)
        : NaN;

  return Number.isFinite(parsed) && parsed !== 0 ? parsed : undefined;
}

export const updateStations = internalAction({
  handler: async (ctx) => {
    const stationURL =
      "https://infobanjirjps.selangor.gov.my/JPSAPI/api/StationRiverLevels/GetWLAllStationData/";

    try {
      // Get all districts
      const districts = await ctx.runMutation(
        internal.sync.stationUpdater.getDistricts
      );

      for (const district of districts) {
        if (!district.jpsDistrictsId) {
          console.log(
            `Skipping district "${district.name}" - no jpsDistrictsId`
          );
          continue;
        }

        const response = await fetch(`${stationURL}${district.jpsDistrictsId}`);
        if (!response.ok) {
          throw new Error(
            `Network response was not ok for district ${district._id}`
          );
        }

        const stationsJps = await response.json();
        if (!stationsJps || !stationsJps.stations) continue;

        for (const stationJps of stationsJps.stations) {
          await ctx.runMutation(internal.sync.stationUpdater.upsertStation, {
            districtId: district._id,
            // JPS returns `id` as a number but the schema (and the
            // `by_jps_sel_id` index) store it as a string, so it must be
            // normalised here. Passing the raw number meant the index lookup in
            // `upsertStation` could never match an existing row.
            stationData: {
              jpsSelId: String(stationJps.id),
              publicInfoId: stationJps.stationId || "",
              stationName: stationJps.stationName || "",
              stationCode: stationJps.stationCode,
              refName: stationJps.referenceName,
              latitude: parseCoordinate(stationJps.latitude),
              longitude: parseCoordinate(stationJps.longitude),
              gsmNumber:
                stationJps.gsmNumber === null
                  ? undefined
                  : stationJps.gsmNumber,
              normalWaterLevel: stationJps.wlth_normal || undefined,
              alertWaterLevel: stationJps.wlth_alert || undefined,
              warningWaterLevel: stationJps.wlth_warning || undefined,
              dangerWaterLevel: stationJps.wlth_danger || undefined,
              stationStatus: stationJps.stationStatus === 1,
              mode: stationJps.mode,
              z1: stationJps.z1,
              z2: stationJps.z2,
              z3: stationJps.z3,
              batteryLevel:
                stationJps.batteryLevel === null
                  ? undefined
                  : stationJps.batteryLevel,
            },
          });
        }
      }

      console.log("Stations updated successfully.");
    } catch (error) {
      console.error("Error updating station info:", error);
      throw error;
    }
  },
});

export const getDistricts = internalMutation({
  handler: async (ctx) => {
    return await ctx.db.query("districts").collect();
  },
});

export const insertDistrict = internalMutation({
  args: { name: v.string(), jpsDistrictsId: v.number() },
  handler: async (ctx, { name, jpsDistrictsId }) => {
    return await ctx.db.insert("districts", { name, jpsDistrictsId });
  },
});

export const upsertStation = internalMutation({
  args: {
    districtId: v.id("districts"),
    stationData: v.object({
      // Must be `v.string()`, matching the schema and the `by_jps_sel_id` index.
      // This was `v.any()`, which disabled validation on the field used as the
      // upsert lookup key and allowed a non-string value to reach the index.
      jpsSelId: v.string(),
      publicInfoId: v.optional(v.string()),
      stationName: v.string(),
      stationCode: v.optional(v.string()),
      refName: v.optional(v.string()),
      latitude: v.optional(v.number()),
      longitude: v.optional(v.number()),
      gsmNumber: v.optional(v.string()),
      normalWaterLevel: v.optional(v.number()),
      alertWaterLevel: v.optional(v.number()),
      warningWaterLevel: v.optional(v.number()),
      dangerWaterLevel: v.optional(v.number()),
      stationStatus: v.boolean(),
      mode: v.optional(v.union(v.string(), v.boolean())),
      z1: v.optional(v.union(v.number(), v.boolean())),
      z2: v.optional(v.union(v.number(), v.boolean())),
      z3: v.optional(v.union(v.number(), v.boolean())),
      batteryLevel: v.optional(v.union(v.number(), v.null())),
    }),
  },
  handler: async (ctx, { districtId, stationData }) => {
    // Check if station exists
    const existing = await ctx.db
      .query("stations")
      .withIndex("by_jps_sel_id", (q) => q.eq("jpsSelId", stationData.jpsSelId))
      .first();

    if (existing) {
      // Update existing station.
      // `omitUndefined` is load-bearing: patching with an explicit `undefined`
      // deletes the field, so without it every field JPS omitted would be
      // destroyed on the stored record.
      await ctx.db.patch(existing._id, {
        ...omitUndefined(stationData),
        districtId,
      });
    } else {
      // Insert new station
      await ctx.db.insert("stations", {
        ...stationData,
        districtId,
      });
    }
  },
});
