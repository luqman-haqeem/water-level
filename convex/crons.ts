import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

// Cron jobs are always registered. Convex separates dev and prod deployments,
// so crons only run in the deployment they're pushed to.
//
// - Production: deploy with `npx convex deploy` (uses CONVEX_DEPLOY_KEY)
// - Development: deploy with `npx convex dev` (local dev deployment)
//
// If you need to disable crons in dev, pause them via the Convex dashboard
// or simply don't push to your dev deployment.
//
// To manually trigger any function:
//   npx convex run sync.waterLevelUpdater.updateWaterLevels

// Update water levels every 15 minutes
crons.interval(
    "update water levels",
    { minutes: 15 },
    api.sync.waterLevelUpdater.updateWaterLevels
);

// Update station metadata every week (Sundays at 2 AM UTC)
crons.weekly(
    "sync station details",
    { dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
    api.sync.stationUpdater.updateStations
);

// Update camera data every week (Sundays at 3 AM UTC)
crons.weekly(
    "update cameras",
    { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
    api.sync.cameraUpdater.updateCameras
);

// Cleanup old water level history data every 4 hours
crons.interval(
    "cleanup old water level history",
    { hours: 4 },
    internal.sync.waterLevelUpdater.cleanupOldHistoryData
);

// Cleanup old water level summaries daily (keep last 24 hours)
crons.interval(
    "cleanup old water level summaries",
    { hours: 24 },
    internal.waterLevelSummaries.cleanupOldSummaries
);

export default crons;
