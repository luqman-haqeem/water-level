import { query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Internal mutation for server-side use only.
// Previously exposed as a public mutation, but removed to prevent
// unauthenticated writes to production data.
// Use the Convex action `sync.waterLevelUpdater.updateWaterLevels` instead.
export const storeWaterLevelSummaryInternal = internalMutation({
  args: {
    districts: v.array(
      v.object({
        districtId: v.number(),
        districtName: v.string(),
        totalStations: v.number(),
        normalCount: v.number(),
        alertCount: v.number(),
        warningCount: v.number(),
        dangerCount: v.number(),
        onlineStations: v.number(),
        offlineStations: v.number(),
        lastUpdated: v.string(),
        allLastUpdated: v.string(),
        timestamp: v.string(),
      })
    ),
    overallStatus: v.string(),
    scrapedAt: v.string(),
  },
  handler: async (ctx, { districts, overallStatus, scrapedAt }) => {
    const summaryId = await ctx.db.insert("waterLevelSummaries", {
      districts,
      overallStatus,
      scrapedAt,
      timestamp: Date.now(),
    });

    return summaryId;
  },
});

// Internal mutation for server-side use only.
// Previously exposed as a public mutation, but removed to prevent
// unauthenticated writes to production data.
// Use the Convex action `sync.waterLevelUpdater.updateWaterLevels` instead.
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
        currentWaterLevel: v.number(),
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
  handler: async (
    ctx,
    { districtId, districtName, jpsDistrictsId, stations }
  ) => {
    // Same logic as public version
    let existingDistrict = await ctx.db
      .query("districts")
      .filter((q) => 
        jpsDistrictsId ? 
          q.eq(q.field("jpsDistrictsId"), jpsDistrictsId) :
          q.eq(q.field("name"), districtName)
      )
      .first();

    let districtDbId;
    if (!existingDistrict) {
      districtDbId = await ctx.db.insert("districts", {
        name: districtName,
        ...(jpsDistrictsId && { jpsDistrictsId: jpsDistrictsId }),
      });
      existingDistrict = await ctx.db.get(districtDbId);
    }

    if (!existingDistrict) {
      throw new Error(`Failed to create or find district: ${districtName}`);
    }

    // Store/update stations and their current water levels
    for (const station of stations) {
      const existingStation = await ctx.db
        .query("stations")
        .withIndex("by_jps_sel_id", (q) =>
          q.eq("jpsSelId", station.id.toString())
        )
        .first();

      let stationDbId;
      if (!existingStation) {
        stationDbId = await ctx.db.insert("stations", {
          jpsSelId: station.id.toString(),
          publicInfoId: station.stationId,
          districtId: existingDistrict._id,
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
        });
      } else {
        stationDbId = existingStation._id;
        await ctx.db.patch(existingStation._id, {
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
        });
      }

      let alertLevel = 0;
      if (station.waterlevelStatus === 3) alertLevel = 3;
      else if (station.waterlevelStatus === 2) alertLevel = 2;
      else if (station.waterlevelStatus === 1) alertLevel = 1;
      else if (station.waterlevelStatus === 0) alertLevel = 0;
      else if (station.waterlevelStatus === -1) {
        if (station.currentWaterLevel >= station.dangerLevel) alertLevel = 3;
        else if (station.currentWaterLevel >= station.warningLevel)
          alertLevel = 2;
        else if (station.currentWaterLevel >= station.alertLevel)
          alertLevel = 1;
        else alertLevel = 0;
      }

      // Use the dedicated upsert function
      await ctx.runMutation(
        internal.sync.waterLevelUpdater.upsertCurrentLevel,
        {
          stationId: stationDbId,
          currentLevel: station.currentWaterLevel,
          alertLevel: alertLevel,
          updatedAt: station.lastUpdate,
        }
      );
    }

    return { success: true, stationsCount: stations.length };
  },
});

export const getLatestWaterLevelSummary = query({
  handler: async (ctx) => {
    const latest = await ctx.db
      .query("waterLevelSummaries")
      .order("desc")
      .first();

    return latest;
  },
});

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
