import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  districts: defineTable({
    jpsDistrictsId: v.optional(v.number()),
    name: v.string(),
  }),

  stations: defineTable({
    jpsSelId: v.any(),
    publicInfoId: v.optional(v.string()),
    districtId: v.id("districts"),
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
  })
    .index("by_jps_sel_id", ["jpsSelId"])
    .index("by_district", ["districtId"])
    .index("by_status", ["stationStatus"]),

  currentLevels: defineTable({
    stationId: v.id("stations"),
    currentLevel: v.number(),
    alertLevel: v.number(), // 0=normal, 1=alert, 2=warning, 3=danger
    updatedAt: v.optional(v.string()),
  }).index("by_station", ["stationId"]),

  cameras: defineTable({
    jpsCameraId: v.string(),
    cameraName: v.string(),
    cameraBrand: v.optional(v.string()),
    districtId: v.id("districts"),
    stationId: v.optional(v.id("stations")), // Link camera to specific station
    imgUrl: v.optional(v.string()),
    isEnabled: v.boolean(),
    isOnline: v.optional(v.boolean()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    mainBasin: v.optional(v.string()),
    subBasin: v.optional(v.string()),
  })
    .index("by_jps_camera_id", ["jpsCameraId"])
    .index("by_district", ["districtId"])
    .index("by_station", ["stationId"])
    .index("by_enabled", ["isEnabled"]),

  favoriteStations: defineTable({
    userId: v.id("users"),
    stationId: v.id("stations"),
  })
    .index("by_user", ["userId"])
    .index("by_user_station", ["userId", "stationId"]),

  favoriteCameras: defineTable({
    userId: v.id("users"),
    cameraId: v.id("cameras"),
  })
    .index("by_user", ["userId"])
    .index("by_user_camera", ["userId", "cameraId"]),

  waterLevelHistory: defineTable({
    stationId: v.id("stations"),
    currentLevel: v.number(),
    alertLevel: v.number(), // 0=normal, 1=alert, 2=warning, 3=danger
    timestamp: v.number(), // Unix timestamp for efficient querying
    recordedAt: v.string(), // ISO string for display purposes (Malaysia time)
  })
    .index("by_station", ["stationId"])
    .index("by_station_time", ["stationId", "timestamp"])
    .index("by_timestamp", ["timestamp"]),

  waterLevelSummaries: defineTable({
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
    timestamp: v.number(),
  }).index("by_timestamp", ["timestamp"]),
});
