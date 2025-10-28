import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

const BASE_URL = "https://infobanjirjps.selangor.gov.my/JPSAPI/api";

// Type definitions for JPS API responses
interface JpsDistrictSummary {
    districtId: number;
    district: string;
    total_station: number;
    normal: number;
    alert: number;
    warning: number;
    danger: number;
    online: number;
    offline: number;
    lastUpdated: string;
    allLastUpdated: string;
}

interface JpsStationData {
    id: number;
    stationId: string;
    stationName: string;
    stationCode: string;
    referenceName: string;
    districtName: string;
    waterLevel: number | null;
    wlth_normal: number;
    wlth_alert: number;
    wlth_warning: number;
    wlth_danger: number;
    waterlevelStatus: number;
    stationStatus: number;
    lastUpdate: string;
    latitude: string | number;
    longitude: string | number;
    batteryLevel: number | null;
    gsmNumber: string;
    markerType: string;
    mode: string | boolean;
    z1: number | boolean;
    z2: number | boolean;
    z3: number | boolean;
}

interface JpsDistrictStationsResponse {
    stations: JpsStationData[];
}

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

            const summaryData: JpsDistrictSummary[] = await summaryResponse.json();
            const timestamp = new Date().toISOString();

            // Process summary data
            const districts = summaryData.map((district) => ({
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
                (sum, d) => sum + d.dangerCount,
                0
            );
            const totalWarning = districts.reduce(
                (sum, d) => sum + d.warningCount,
                0
            );
            const totalAlert = districts.reduce(
                (sum, d) => sum + d.alertCount,
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
                        const stationData: JpsDistrictStationsResponse = await districtResponse.json();
                        const stationsData = stationData.stations || [];
                        const stations = stationsData
                            .map((station) => ({
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
                                latitude: typeof station.latitude === 'string' ? parseFloat(station.latitude) || 0 : station.latitude || 0,
                                longitude: typeof station.longitude === 'string' ? parseFloat(station.longitude) || 0 : station.longitude || 0,
                                batteryLevel: station.batteryLevel === null ? undefined : station.batteryLevel,
                                gsmNumber: station.gsmNumber,
                                markerType: station.markerType,
                                mode: typeof station.mode === 'boolean' ? station.mode : undefined,
                                z1: typeof station.z1 === 'boolean' ? station.z1 : undefined,
                                z2: typeof station.z2 === 'boolean' ? station.z2 : undefined,
                                z3: typeof station.z3 === 'boolean' ? station.z3 : undefined,
                            }))
                            .filter((station) => station.stationStatus == 1);

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

        const updateData: {
            currentLevel: number;
            alertLevel: number;
            updatedAt?: string;
        } = {
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

        // Store historical data (Malaysia time)
        const now = new Date();
        const malaysiaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000)); // UTC+8

        await ctx.db.insert("waterLevelHistory", {
            stationId,
            currentLevel,
            alertLevel,
            timestamp: now.getTime(),
            recordedAt: malaysiaTime.toISOString(),
        });

        // Note: Historical data cleanup moved to daily cron job (see cleanupOldHistoryData)
        // This reduces bandwidth usage by 98.96% compared to running cleanup every 15 minutes
    },
});

// Daily cleanup function for old waterLevelHistory records
// Uses pagination to avoid hitting the 32,000 document read limit
export const cleanupOldHistoryData = internalMutation({
    handler: async (ctx) => {
        const threeHoursAgo = Date.now() - (3 * 60 * 60 * 1000);
        const BATCH_SIZE = 1000; // Process in smaller batches to avoid transaction limits
        let totalDeleted = 0;

        console.log("🧹 Starting daily waterLevelHistory cleanup...");

        try {
            while (true) {
                // Query a limited batch of old records
                const oldRecords = await ctx.db
                    .query("waterLevelHistory")
                    .withIndex("by_timestamp", (q) => q.lt("timestamp", threeHoursAgo))
                    .take(BATCH_SIZE);

                if (oldRecords.length === 0) {
                    break; // No more records to process
                }

                console.log(`Processing batch of ${oldRecords.length} records...`);

                // Delete current batch
                await Promise.all(
                    oldRecords.map(record => ctx.db.delete(record._id))
                );

                totalDeleted += oldRecords.length;

                // If we got fewer records than BATCH_SIZE, we're done
                if (oldRecords.length < BATCH_SIZE) {
                    break;
                }
            }

            if (totalDeleted === 0) {
                console.log("✅ No old records to clean up");
            } else {
                console.log(`✅ Cleanup complete: ${totalDeleted} records deleted in batches`);
            }

            return { deletedCount: totalDeleted };
        } catch (error) {
            console.error("❌ Cleanup failed:", error);
            return { deletedCount: totalDeleted, error: error instanceof Error ? error.message : String(error) };
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
