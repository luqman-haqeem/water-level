import { internalAction, internalMutation, ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { convertJpsDateToIso } from "./jpsDate";
import { computeJpsFingerprint, fingerprintToRecord, latestJpsUpdate } from "./changeDetection";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { WATER_LEVELS_KEY } from "../lib/syncKeys";
import { parseThreshold } from "../lib/alertLevel";
import {
    CLEANUP_BATCH_SIZE,
    CLEANUP_MAX_BATCHES_PER_RUN,
    HISTORY_RETENTION_MS,
} from "../lib/retention";

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
    // Nullable in practice: JPS omits or nulls thresholds for stations it has
    // not configured, and sends `waterlevelStatus: null` for some of them.
    // Declaring them non-null hid that from the type checker.
    wlth_normal: number | null;
    wlth_alert: number | null;
    wlth_warning: number | null;
    wlth_danger: number | null;
    waterlevelStatus: number | null;
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

export interface UpdateResult {
    success: boolean;
    changed: boolean;
    districtsCount: number;
    stationsCount: number;
    overallStatus: string;
    timestamp: string;
    error?: string;
}

function computeOverallStatus(summaryData: JpsDistrictSummary[]): string {
    const total = (pick: (d: JpsDistrictSummary) => number) =>
        summaryData.reduce((sum, d) => sum + pick(d), 0);
    if (total((d) => d.danger) > 0) return "DANGER";
    if (total((d) => d.warning) > 0) return "WARNING";
    if (total((d) => d.alert) > 0) return "ALERT";
    return "NORMAL";
}

/** Publishes the snapshot; an R2 failure must never fail the Convex write. */
async function publishQuietly(ctx: ActionCtx, includeData: boolean): Promise<void> {
    try {
        await ctx.runAction(internal.sync.snapshotPublisher.publishSnapshot, { includeData });
    } catch (error) {
        console.error("Snapshot publish failed (Convex data is intact):", error);
    }
}

export const updateWaterLevels = internalAction({
    handler: async (ctx): Promise<UpdateResult> => {
        const attemptedAt = new Date().toISOString();
        console.debug("🌊 Starting water level sync…");

        const previous = await ctx.runQuery(internal.syncState.get, { key: WATER_LEVELS_KEY });

        // 1. Summary (the only fetch whose failure aborts the run)
        let summaryData: JpsDistrictSummary[];
        try {
            const summaryResponse = await fetchWithRetry(
                `${BASE_URL}/StationRiverLevels/GetWLStationSummary`,
                { timeoutMs: 20_000, retries: 1, backoffMs: 5_000 }
            );
            const parsed: unknown = await summaryResponse.json();
            if (!Array.isArray(parsed)) {
                throw new Error("JPS summary response is not an array");
            }
            summaryData = parsed as JpsDistrictSummary[];
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("❌ JPS summary fetch failed:", message);
            await ctx.runMutation(internal.syncState.record, {
                key: WATER_LEVELS_KEY,
                attemptedAt,
                status: "upstream_error",
                error: message,
            });
            await publishQuietly(ctx, false);
            return {
                success: false,
                changed: false,
                districtsCount: 0,
                stationsCount: 0,
                overallStatus: "UNKNOWN",
                timestamp: attemptedAt,
                error: message,
            };
        }

        // 2. Change detection — JPS updates irregularly; skip writes when nothing moved
        const stamps = summaryData.map((d) => ({ districtId: d.districtId, allLastUpdated: d.allLastUpdated }));
        const fingerprint = computeJpsFingerprint(stamps);
        const jpsLastUpdate = latestJpsUpdate(stamps) ?? undefined;
        const overallStatus = computeOverallStatus(summaryData);

        if (previous && previous.lastJpsFingerprint === fingerprint) {
            console.debug("JPS data unchanged since last run; skipping DB writes");
            await ctx.runMutation(internal.syncState.record, {
                key: WATER_LEVELS_KEY,
                attemptedAt,
                status: "ok",
                fingerprint,
                jpsLastUpdate,
            });
            await publishQuietly(ctx, false);
            return {
                success: true,
                changed: false,
                districtsCount: summaryData.length,
                stationsCount: 0,
                overallStatus,
                timestamp: attemptedAt,
            };
        }

        // 3. District station data (per-district failures are warn-and-continue)
        let totalStationsSaved = 0;
        let failedDistricts = 0;
        for (const district of summaryData) {
            try {
                const districtResponse = await fetchWithRetry(
                    `${BASE_URL}/StationRiverLevels/GetWLAllStationData/${district.districtId}`,
                    { timeoutMs: 20_000, retries: 1, backoffMs: 5_000 }
                );
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
                            (station.waterLevel === null || station.waterLevel === -9999)
                                ? null
                                : station.waterLevel,
                        // `parseThreshold`, not `|| 0`: collapsing an absent
                        // threshold to 0 made `level >= dangerLevel` true for
                        // every reading, so a station JPS publishes no
                        // thresholds for classified as DANGER (#73). Absent now
                        // stays absent all the way to the snapshot.
                        normalLevel: parseThreshold(station.wlth_normal),
                        alertLevel: parseThreshold(station.wlth_alert),
                        warningLevel: parseThreshold(station.wlth_warning),
                        dangerLevel: parseThreshold(station.wlth_danger),
                        // `??`, not `||`: JPS sends 0 for "normal", and `0 || -1`
                        // rewrote it to -1, pushing a reading JPS had already
                        // classified as safe down the threshold-guessing path.
                        waterlevelStatus: station.waterlevelStatus ?? -1,
                        stationStatus: station.stationStatus || 0,
                        lastUpdate: convertJpsDateToIso(station.lastUpdate),
                        latitude: typeof station.latitude === 'string' ? parseFloat(station.latitude) || undefined : station.latitude || undefined,
                        longitude: typeof station.longitude === 'string' ? parseFloat(station.longitude) || undefined : station.longitude || undefined,
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
                        districtName: district.district,
                        jpsDistrictsId: district.districtId,
                        stations,
                    }
                );
                if (result.success) totalStationsSaved += result.stationsCount;
            } catch (error) {
                failedDistricts += 1;
                console.warn(`Failed to fetch district ${district.districtId}: ${error}`);
            }
        }

        // Every district failed: JPS answered the summary but served nothing
        // else, so treat the run as an upstream outage, not a successful sync.
        if (summaryData.length > 0 && failedDistricts === summaryData.length) {
            const message = `All ${summaryData.length} district fetches failed`;
            console.error(`❌ ${message}`);
            await ctx.runMutation(internal.syncState.record, {
                key: WATER_LEVELS_KEY,
                attemptedAt,
                status: "upstream_error",
                error: message,
            });
            await publishQuietly(ctx, false);
            return {
                success: false,
                changed: false,
                districtsCount: summaryData.length,
                stationsCount: 0,
                overallStatus,
                timestamp: attemptedAt,
                error: message,
            };
        }

        if (failedDistricts > 0) {
            console.warn(
                `${failedDistricts} district fetch(es) failed; fingerprint not recorded so the next run retries`
            );
        }

        // 4. Record success and publish the full snapshot. When some districts
        // failed the fingerprint is withheld so the next run re-fetches them.
        await ctx.runMutation(internal.syncState.record, {
            key: WATER_LEVELS_KEY,
            attemptedAt,
            status: "ok",
            fingerprint: fingerprintToRecord(fingerprint, failedDistricts),
            jpsLastUpdate,
            syncedAt: attemptedAt,
        });
        await publishQuietly(ctx, true);

        console.debug(
            `✅ Sync complete: ${summaryData.length} districts, ${totalStationsSaved} stations, status ${overallStatus}`
        );
        return {
            success: true,
            changed: true,
            districtsCount: summaryData.length,
            stationsCount: totalStationsSaved,
            overallStatus,
            timestamp: attemptedAt,
        };
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

        // Notify whenever station is at danger level (cooldown logic in notifyDangerForStation prevents spam)
        const shouldNotifyDanger = alertLevel === 3;

        // Don't notify on stale data (older than 45 minutes)
        // NOTE: This threshold must stay in sync with the frontend `isStale` utility
        // in src/utils/timeUtils.ts. Convex backend and Vite frontend cannot share
        // modules, so the constant is duplicated by necessity.
        const STALENESS_MS = 2_700_000;
        const isDataStale = updatedAt
            ? (Date.now() - new Date(updatedAt).getTime() > STALENESS_MS)
            : true;

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

        // Schedule danger notification if at danger level with fresh data
        if (shouldNotifyDanger && !isDataStale) {
            await ctx.scheduler.runAfter(
                0,
                internal.notifications.notifyDangerForStation,
                { stationId, currentLevel, updatedAt }
            );
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

// Cleanup for waterLevelHistory rows past the retention horizon.
// Uses pagination to avoid hitting the 32,000 document read limit.
//
// The cutoff is HISTORY_RETENTION_MS, no longer the 3 hours the trend charts
// display. Those were the same value, so history was deleted as soon as it left
// the chart and nothing ever accumulated (#80).
export const cleanupOldHistoryData = internalMutation({
    handler: async (ctx) => {
        const cutoff = Date.now() - HISTORY_RETENTION_MS;
        const BATCH_SIZE = CLEANUP_BATCH_SIZE;
        const MAX_BATCHES_PER_RUN = CLEANUP_MAX_BATCHES_PER_RUN;
        let totalDeleted = 0;
        let batchesProcessed = 0;

        console.log("🧹 Starting waterLevelHistory cleanup...");

        try {
            while (batchesProcessed < MAX_BATCHES_PER_RUN) {
                // Query a limited batch of old records
                const oldRecords = await ctx.db
                    .query("waterLevelHistory")
                    .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoff))
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
                batchesProcessed += 1;

                // If we got fewer records than BATCH_SIZE, we're done
                if (oldRecords.length < BATCH_SIZE) {
                    break;
                }
            }

            const hasMore = (
                await ctx.db
                    .query("waterLevelHistory")
                    .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoff))
                    .take(1)
            ).length > 0;

            if (totalDeleted === 0) {
                console.log("✅ No old records to clean up");
            } else {
                console.log(
                    `✅ Cleanup complete: ${totalDeleted} records deleted in ${batchesProcessed} batches${
                        hasMore ? " (more records remain for next run)" : ""
                    }`
                );
            }

            return {
                deletedCount: totalDeleted,
                batchesProcessed,
                hasMore,
            };
        } catch (error) {
            console.error("❌ Cleanup failed:", error);
            return {
                deletedCount: totalDeleted,
                batchesProcessed,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
});

