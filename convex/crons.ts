import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

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

// All sync entry points are registered via `internal.*`, never `api.*`.
// Referencing them through `api.*` would require declaring them as public
// `action`s, which in Convex makes them callable by anyone on the internet
// (the deployment URL ships to browsers in VITE_CONVEX_URL and is not a
// secret). Crons can invoke internal functions directly, so there is no
// reason for any of these to be public.

// Update water levels every 15 minutes
crons.interval(
    "update water levels",
    { minutes: 15 },
    internal.sync.waterLevelUpdater.updateWaterLevels
);

// Update station metadata every week (Sundays at 2 AM UTC)
crons.weekly(
    "sync station details",
    { dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
    internal.sync.stationUpdater.updateStations
);

// Update camera data every week (Sundays at 3 AM UTC)
crons.weekly(
    "update cameras",
    { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
    internal.sync.cameraUpdater.updateCameras
);

// Cleanup old water level history data every 4 hours
crons.interval(
    "cleanup old water level history",
    { hours: 4 },
    internal.sync.waterLevelUpdater.cleanupOldHistoryData
);

export default crons;
