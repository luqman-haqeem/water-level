import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// NOTE: every cron target is referenced via `internal.*`, never `api.*`.
// Referencing a target through `api.*` forces it to be declared as a public
// `action`, which in Convex means anyone on the internet can invoke it — the
// deployment URL is not a secret. Crons can call internal functions directly.

// Crons only register when the deployment sets CRONS_ENABLED=true (Convex
// dashboard → Settings → Environment Variables). Set it on production only:
// the sync pipeline uploads ~1 GB/day of camera frames + JSON to R2, and a dev
// deployment running it burns the free tier's monthly egress in a day.
//
// crons.ts is re-evaluated on every push, so toggling the env var takes effect
// on the next `npx convex dev` / `npx convex deploy`.
//
// Internal functions are still runnable from the CLI and the Dashboard (both
// authenticate with an admin key, not as a client), so keeping them internal
// costs nothing operationally.
//
// To manually trigger any function in dev:
//   npx convex run sync/waterLevelUpdater:updateWaterLevels
const cronsEnabled = process.env.CRONS_ENABLED === "true";

if (cronsEnabled) {
    // Update water levels every 5 minutes. JPS publishes irregularly (15 min nominal,
    // 25 min–hours under load); polling often and skipping unchanged data keeps our
    // lag minimal without extra DB writes (see sync/changeDetection.ts).
    crons.interval(
        "update water levels",
        { minutes: 5 },
        internal.sync.waterLevelUpdater.updateWaterLevels
    );

    // Mirror CCTV frames to R2. All cameras every 15 min keeps R2 writes ≈ 262k/month
    // (free tier: 1M); cameras at alert+ stations refresh every 5 min.
    crons.interval(
        "mirror camera images (all)",
        { minutes: 15 },
        internal.sync.cameraImageSync.syncCameraImages,
        { tier: "all" }
    );

    crons.interval(
        "mirror camera images (alert)",
        { minutes: 5 },
        internal.sync.cameraImageSync.syncCameraImages,
        { tier: "alert" }
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
}

export default crons;
