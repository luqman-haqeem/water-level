import { runSync } from "./sync";
import { fetchSummary } from "./jps";
import { fetchCameras, publishCameras } from "./cameraMetadata";

/** The weekly camera metadata refresh; every other trigger is the water level sync. */
const WEEKLY_METADATA_CRON = "0 2 * * 0";

/**
 * wl-sync — water level sync and weekly metadata refresh (issue #67, Phases 2 and 4).
 *
 * Replaces `convex/sync/waterLevelUpdater.ts` and `cameraUpdater.ts`. Station metadata
 * needs no separate job: it arrives with the readings on every run.
 *
 * No cron triggers are declared in wrangler.toml yet — Phase 5 schedules this against a
 * staging bucket prefix first.
 */
export default {
    async scheduled(controller: ScheduledController, env: Env): Promise<void> {
        if (controller.cron === WEEKLY_METADATA_CRON) {
            const summary = await fetchSummary(env.JPS_BASE_URL);
            const { cameras, failedDistricts } = await fetchCameras(env.JPS_BASE_URL, summary);

            // A partial roster would silently drop every camera in the districts that
            // failed. Better to keep last week's list until a clean fetch succeeds.
            if (failedDistricts > 0) {
                console.warn(
                    `camera metadata: ${failedDistricts} district(s) failed; keeping the published roster`
                );
                return;
            }

            await publishCameras(env.SNAPSHOT, cameras, new Date().toISOString());
            // eslint-disable-next-line no-console -- `wrangler tail` is a scheduled Worker's only output
            console.log(`wl-sync metadata: ${cameras.length} cameras published`);
            return;
        }

        const result = await runSync(env);
        // eslint-disable-next-line no-console -- `wrangler tail` is a scheduled Worker's only output
        console.log(
            `wl-sync: success=${result.success} changed=${result.changed} ` +
                `districts=${result.districtsCount} stations=${result.stationsCount} ` +
                `status=${result.overallStatus}${result.error ? ` error=${result.error}` : ""}`
        );
    },
};
