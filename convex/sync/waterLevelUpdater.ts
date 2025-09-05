import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

const BASE_URL = "https://infobanjirjps.selangor.gov.my/JPSAPI/api";

// Helper function to convert JPS date format (DD/MM/YYYY HH:mm:ss) to ISO string
// JPS provides Malaysian local time (UTC+8), we need to convert to UTC
function convertJpsDateToIso(jpsDate: string): string {
  if (!jpsDate) return new Date().toISOString();

  try {
    // JPS format: "21/08/2025 21:15:00" (Malaysian local time UTC+8)
    const [datePart, timePart] = jpsDate.split(" ");
    const [day, month, year] = datePart.split("/");
    const [hour, minute, second] = timePart.split(":");

    // Create Date object in Malaysian timezone (UTC+8)
    // First create as if it's UTC, then subtract 8 hours to convert from Malaysian time to UTC
    const malaysianDate = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second)
    );

    // Subtract 8 hours to convert from Malaysian time (UTC+8) to UTC
    const utcDate = new Date(malaysianDate.getTime() - 8 * 60 * 60 * 1000);

    return utcDate.toISOString();
  } catch (error) {
    console.warn(`Failed to convert JPS date "${jpsDate}":`, error);
    return new Date().toISOString();
  }
}

export const updateWaterLevels = action({
  handler: async (
    ctx
  ): Promise<{
    success: boolean;
    summaryId: string;
    districtsCount: number;
    stationsCount: number;
    overallStatus: string;
    timestamp: string;
  }> => {
    try {
      console.log("🌊 Starting automated water level scraping...");

      // Fetch summary data from JPS API
      const summaryResponse = await fetch(
        `${BASE_URL}/StationRiverLevels/GetWLStationSummary`
      );
      if (!summaryResponse.ok) {
        throw new Error(
          `HTTP ${summaryResponse.status}: Failed to fetch water level summary`
        );
      }

      const summaryData = await summaryResponse.json();
      const timestamp = new Date().toISOString();

      // Process summary data
      const districts = summaryData.map((district: any) => ({
        districtId: district.districtId,
        districtName: district.district,
        totalStations: district.total_station,
        normalCount: district.normal,
        alertCount: district.alert,
        warningCount: district.warning,
        dangerCount: district.danger,
        onlineStations: district.online,
        offlineStations: district.offline,
        lastUpdated: district.lastUpdated,
        allLastUpdated: district.allLastUpdated,
        timestamp: timestamp,
      }));

      // Calculate overall status
      const totalDanger = districts.reduce(
        (sum: number, d: any) => sum + d.dangerCount,
        0
      );
      const totalWarning = districts.reduce(
        (sum: number, d: any) => sum + d.warningCount,
        0
      );
      const totalAlert = districts.reduce(
        (sum: number, d: any) => sum + d.alertCount,
        0
      );

      let overallStatus = "NORMAL";
      if (totalDanger > 0) overallStatus = "DANGER";
      else if (totalWarning > 0) overallStatus = "WARNING";
      else if (totalAlert > 0) overallStatus = "ALERT";

      // Save summary to Convex
      const summaryId: string = await ctx.runMutation(
        internal.waterLevelData.storeWaterLevelSummaryInternal,
        {
          districts,
          overallStatus,
          scrapedAt: timestamp,
        }
      );

      console.log(`✅ Summary saved with ID: ${summaryId}`);

      // Fetch and save district station details with water level data
      let totalStationsSaved = 0;
      for (const district of districts) {
        try {
          const districtResponse = await fetch(
            `${BASE_URL}/StationRiverLevels/GetWLAllStationData/${district.districtId}`
          );
          if (districtResponse.ok) {
            const stationData = await districtResponse.json();
            const stationsData = stationData.stations || [];
            const stations = stationsData
              .map((station: any) => ({
                id: station.id,
                stationId: station.stationId || "",
                name: station.stationName,
                stationCode: station.stationCode,
                referenceName: station.referenceName,
                districtName: station.districtName,
                currentWaterLevel:
                  station.waterLevel === null || station.waterLevel === -9999
                    ? 0
                    : station.waterLevel,
                normalLevel: station.wlth_normal || 0,
                alertLevel: station.wlth_alert || 0,
                warningLevel: station.wlth_warning || 0,
                dangerLevel: station.wlth_danger || 0,
                waterlevelStatus: station.waterlevelStatus || -1,
                stationStatus: station.stationStatus || 0,
                lastUpdate: convertJpsDateToIso(station.lastUpdate),
                latitude: parseFloat(station.latitude) || 0,
                longitude: parseFloat(station.longitude) || 0,
                batteryLevel: station.batteryLevel === null ? undefined : station.batteryLevel,
                gsmNumber: station.gsmNumber,
                markerType: station.markerType,
                mode: station.mode,
                z1: station.z1,
                z2: station.z2,
                z3: station.z3,
              }))
              .filter((station: any) => station.stationStatus == 1);

            const result = await ctx.runMutation(
              internal.waterLevelData.storeDistrictStationsInternal,
              {
                districtId: district.districtId,
                districtName: district.districtName,
                jpsDistrictsId: district.districtId,
                stations,
              }
            );

            if (result.success) {
              totalStationsSaved += result.stationsCount;
            }
          }
        } catch (error) {
          console.warn(
            `Failed to fetch district ${district.districtId}: ${error}`
          );
        }
      }

      console.log(
        `✅ Automated scraping complete: ${districts.length} districts, ${totalStationsSaved} stations, Status: ${overallStatus}`
      );

      return {
        success: true,
        summaryId,
        districtsCount: districts.length,
        stationsCount: totalStationsSaved,
        overallStatus,
        timestamp,
      };
    } catch (error) {
      console.error("❌ Automated water level scraping failed:", error);
      throw error;
    }
  },
});

export const getDistricts = internalMutation({
  handler: async (ctx) => {
    return await ctx.db.query("districts").collect();
  },
});

export const getStationByJpsId = internalMutation({
  args: { jpsSelId: v.string() },
  handler: async (ctx, { jpsSelId }) => {
    return await ctx.db
      .query("stations")
      .withIndex("by_jps_sel_id", (q) => q.eq("jpsSelId", jpsSelId))
      .first();
  },
});

export const upsertCurrentLevel = internalMutation({
  args: {
    stationId: v.id("stations"),
    currentLevel: v.number(),
    alertLevel: v.number(),
    updatedAt: v.optional(v.string()),
  },
  handler: async (ctx, { stationId, currentLevel, alertLevel, updatedAt }) => {
    // Check if current level exists for this station
    const existing = await ctx.db
      .query("currentLevels")
      .withIndex("by_station", (q) => q.eq("stationId", stationId))
      .first();

    const updateData: any = {
      currentLevel,
      alertLevel,
    };
    if (updatedAt) {
      updateData.updatedAt = updatedAt;
    }

    if (existing) {
      // Update existing level
      await ctx.db.patch(existing._id, updateData);
    } else {
      // Insert new level
      await ctx.db.insert("currentLevels", {
        stationId,
        ...updateData,
      });
    }
  },
});

// Helper function to determine the alert level
function getAlertLevel(
  waterLevel: number,
  dangerLevel: number,
  warningLevel: number,
  alertLevel: number
): number {
  if (waterLevel >= dangerLevel) return 3;
  if (waterLevel >= warningLevel) return 2;
  if (waterLevel >= alertLevel) return 1;
  return 0;
}
