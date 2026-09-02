import { internalMutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of a station record coming from the JPS API scraper */
interface JpsStationInput {
  id: number;
  stationId: string;
  name: string;
  stationCode?: string;
  referenceName?: string;
  districtName: string;
  currentWaterLevel: number | null;
  normalLevel: number;
  alertLevel: number;
  warningLevel: number;
  dangerLevel: number;
  waterlevelStatus: number;
  stationStatus: number;
  lastUpdate: string;
  latitude?: number;
  longitude?: number;
  batteryLevel?: number | null;
  gsmNumber?: string;
  markerType?: string;
  mode?: boolean;
  z1?: boolean;
  z2?: boolean;
  z3?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determines the alert level (0-3) from a JPS waterlevelStatus code.
 * Falls back to threshold-based computation when status is -1 (below normal).
 * Returns -1 when water level data is unavailable (null).
 */
function computeAlertLevel(station: JpsStationInput): number {
  if (station.currentWaterLevel === null) return -1; // unknown — no data

  switch (station.waterlevelStatus) {
    case 3:
      return 3; // danger
    case 2:
      return 2; // warning
    case 1:
      return 1; // alert
    case 0:
      return 0; // normal
    case -1:
      // Below normal — determine level based on thresholds
      if (station.currentWaterLevel >= station.dangerLevel) return 3;
      if (station.currentWaterLevel >= station.warningLevel) return 2;
      if (station.currentWaterLevel >= station.alertLevel) return 1;
      return 0;
    default:
      return 0;
  }
}

/**
 * Ensures a district exists in the database, creating it if necessary.
 * Returns the district document.
 *
 * Convex has no uniqueness constraint, so "look up, then insert if absent" is
 * not atomic across concurrent mutations: two overlapping syncs could both see
 * "absent" and both insert. `updateWaterLevels` calls this once per district in
 * a loop, so overlapping runs made that window easy to hit. Duplicate districts
 * fragment stations across rows, which under-reports district station counts and
 * can hide stations — including ones at danger level — from the UI.
 *
 * Mitigation: re-check immediately before inserting, so a duplicate created
 * between the two reads is picked up. This is now cheap because `districts` has
 * indexes; it previously required a full-table `.filter()` scan.
 */
async function ensureDistrict(
  ctx: MutationCtx,
  districtName: string,
  jpsDistrictsId?: number
) {
  // Note `!== undefined` rather than a truthy check: a legitimate
  // `jpsDistrictsId` of 0 would otherwise fall through to name matching here and
  // be dropped from the inserted document below.
  const findDistrict = () =>
    jpsDistrictsId !== undefined
      ? ctx.db
          .query("districts")
          .withIndex("by_jps_districts_id", (q) =>
            q.eq("jpsDistrictsId", jpsDistrictsId)
          )
          .first()
      : ctx.db
          .query("districts")
          .withIndex("by_name", (q) => q.eq("name", districtName))
          .first();

  let existingDistrict = await findDistrict();

  if (!existingDistrict) {
    // Re-check inside the same transaction to collapse concurrent creators.
    existingDistrict = await findDistrict();

    if (!existingDistrict) {
      const districtDbId = await ctx.db.insert("districts", {
        name: districtName,
        ...(jpsDistrictsId !== undefined && { jpsDistrictsId }),
      });
      existingDistrict = await ctx.db.get(districtDbId);
    }
  }

  if (!existingDistrict) {
    throw new Error(`Failed to create or find district: ${districtName}`);
  }

  return existingDistrict;
}

/**
 * Upserts a station record and updates its current water level.
 * Handles both insert (new station) and patch (existing station).
 */
async function upsertStation(
  ctx: MutationCtx,
  station: JpsStationInput,
  districtId: Id<"districts">
) {
  const existingStation = await ctx.db
    .query("stations")
    .withIndex("by_jps_sel_id", (q) =>
      q.eq("jpsSelId", station.id.toString())
    )
    .first();

  const stationFields = {
    publicInfoId: station.stationId,
    stationName: station.name,
    stationCode: station.stationCode,
    refName: station.referenceName,
    gsmNumber: station.gsmNumber,
    normalWaterLevel: station.normalLevel,
    alertWaterLevel: station.alertLevel,
    warningWaterLevel: station.warningLevel,
    dangerWaterLevel: station.dangerLevel,
    stationStatus: station.stationStatus === 1,
    batteryLevel:
      station.batteryLevel === null ? undefined : station.batteryLevel,
    // Only overwrite coordinates if the API provides valid values.
    // JPS removed lat/lng from their API; writing 0/undefined would destroy stored data.
    ...(station.latitude && station.latitude !== 0 ? { latitude: station.latitude } : {}),
    ...(station.longitude && station.longitude !== 0 ? { longitude: station.longitude } : {}),
  };

  let stationDbId: Id<"stations">;
  if (!existingStation) {
    stationDbId = await ctx.db.insert("stations", {
      jpsSelId: station.id.toString(),
      districtId,
      ...stationFields,
    });
  } else {
    stationDbId = existingStation._id;
    await ctx.db.patch(existingStation._id, stationFields);
  }

  // Update current water level via the dedicated upsert function
  // Skip when currentWaterLevel is null (no data available from API)
  if (station.currentWaterLevel !== null) {
    const alertLevel = computeAlertLevel(station);
    await ctx.runMutation(
      internal.sync.waterLevelUpdater.upsertCurrentLevel,
      {
        stationId: stationDbId,
        currentLevel: station.currentWaterLevel,
        alertLevel,
        updatedAt: station.lastUpdate,
      }
    );
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Stores/updates stations for a district and their current water levels.
 * Internal-only to prevent unauthenticated writes.
 */
export const storeDistrictStationsInternal = internalMutation({
  args: {
    districtId: v.number(),
    districtName: v.string(),
    jpsDistrictsId: v.optional(v.number()),
    stations: v.array(
      v.object({
        id: v.number(),
        stationId: v.string(),
        name: v.string(),
        stationCode: v.optional(v.string()),
        referenceName: v.optional(v.string()),
        districtName: v.string(),
        currentWaterLevel: v.union(v.number(), v.null()),
        normalLevel: v.number(),
        alertLevel: v.number(),
        warningLevel: v.number(),
        dangerLevel: v.number(),
        waterlevelStatus: v.number(),
        stationStatus: v.number(),
        lastUpdate: v.string(),
        latitude: v.optional(v.number()),
        longitude: v.optional(v.number()),
        batteryLevel: v.optional(v.union(v.number(), v.null())),
        gsmNumber: v.optional(v.string()),
        markerType: v.optional(v.string()),
        mode: v.optional(v.boolean()),
        z1: v.optional(v.boolean()),
        z2: v.optional(v.boolean()),
        z3: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, { districtName, jpsDistrictsId, stations }) => {
    const district = await ensureDistrict(ctx, districtName, jpsDistrictsId);

    for (const station of stations) {
      await upsertStation(ctx, station, district._id);
    }

    return { success: true, stationsCount: stations.length };
  },
});

// REMOVED: getDistrictsWithCounts (unreferenced anywhere).
// It fanned out N+1 reads over every district x every station on each call, with
// no auth and no caching key beyond the query itself — and the district count is
// itself attacker-influenced if district creation is ever re-exposed. The UI
// derives these counts from `stations.getStationsWithDetails`, which it already
// subscribes to.
