import { query, internalMutation, MutationCtx } from "./_generated/server";
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
  latitude: number;
  longitude: number;
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
 */
async function ensureDistrict(
  ctx: MutationCtx,
  districtName: string,
  jpsDistrictsId?: number
) {
  let existingDistrict = await ctx.db
    .query("districts")
    .filter((q) =>
      jpsDistrictsId
        ? q.eq(q.field("jpsDistrictsId"), jpsDistrictsId)
        : q.eq(q.field("name"), districtName)
    )
    .first();

  if (!existingDistrict) {
    const districtDbId = await ctx.db.insert("districts", {
      name: districtName,
      ...(jpsDistrictsId && { jpsDistrictsId }),
    });
    existingDistrict = await ctx.db.get(districtDbId);
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
    latitude: station.latitude,
    longitude: station.longitude,
    gsmNumber: station.gsmNumber,
    normalWaterLevel: station.normalLevel,
    alertWaterLevel: station.alertLevel,
    warningWaterLevel: station.warningLevel,
    dangerWaterLevel: station.dangerLevel,
    stationStatus: station.stationStatus === 1,
    batteryLevel:
      station.batteryLevel === null ? undefined : station.batteryLevel,
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
        latitude: v.number(),
        longitude: v.number(),
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

// ─── Queries ──────────────────────────────────────────────────────────────────

export const getDistrictsWithCounts = query({
  handler: async (ctx) => {
    const districts = await ctx.db.query("districts").collect();

    const districtsWithCounts = await Promise.all(
      districts.map(async (district) => {
        const stations = await ctx.db
          .query("stations")
          .withIndex("by_district", (q) => q.eq("districtId", district._id))
          .collect();

        const currentLevels = await Promise.all(
          stations.map((station) =>
            ctx.db
              .query("currentLevels")
              .withIndex("by_station", (q) => q.eq("stationId", station._id))
              .first()
          )
        );

        const alertCounts = currentLevels.reduce(
          (counts, level) => {
            if (!level) return counts;
            switch (level.alertLevel) {
              case 0:
                counts.normal++;
                break;
              case 1:
                counts.alert++;
                break;
              case 2:
                counts.warning++;
                break;
              case 3:
                counts.danger++;
                break;
            }
            return counts;
          },
          { normal: 0, alert: 0, warning: 0, danger: 0 }
        );

        return {
          ...district,
          totalStations: stations.length,
          onlineStations: stations.filter((s) => s.stationStatus).length,
          offlineStations: stations.filter((s) => !s.stationStatus).length,
          ...alertCounts,
        };
      })
    );

    return districtsWithCounts;
  },
});
