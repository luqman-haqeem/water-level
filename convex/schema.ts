import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  districts: defineTable({
    jpsDistrictsId: v.optional(v.number()),
    name: v.string(),
  })
    // Without these, `ensureDistrict` had to use `.filter()`, i.e. a full table
    // scan on every station sync. Convex has no uniqueness constraint, so these
    // are also what make the duplicate check cheap enough to repeat inside the
    // transaction (see the race note in waterLevelData.ensureDistrict).
    .index("by_jps_districts_id", ["jpsDistrictsId"])
    .index("by_name", ["name"]),

  stations: defineTable({
    jpsSelId: v.string(),
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
    stationId: v.optional(v.id("stations")),
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

  notificationLog: defineTable({
    stationId: v.id("stations"),
    notifiedAt: v.number(),
    alertLevel: v.number(),
  })
    .index("by_station", ["stationId"])
    .index("by_notified_at", ["notifiedAt"]),
});
