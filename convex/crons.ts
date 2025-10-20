import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

// Update water levels every 15 minutes
crons.interval(
  "update water levels",
  { minutes: 15 },
  api.sync.waterLevelUpdater.updateWaterLevels
);

// Update station metadata every week (Sundays at 2 AM)
crons.weekly(
  "sync station details",
  { dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
  api.sync.stationUpdater.updateStations
);

// Update camera data every week (Sundays at 3 AM)
crons.weekly(
  "update cameras",
  { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
  api.sync.cameraUpdater.updateCameras
);

// Cleanup old water level history data daily (1 AM UTC = 9 AM Malaysia time)
// This runs once per day instead of every 15 minutes, reducing operations by 98.96%
crons.daily(
  "cleanup old water level history",
  { hourUTC: 1, minuteUTC: 0 },
  internal.sync.waterLevelUpdater.cleanupOldHistoryData
);

export default crons;
