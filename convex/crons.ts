import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

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

export default crons;
