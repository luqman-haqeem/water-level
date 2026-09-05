import { runSync } from "./sync";

/**
 * wl-sync — water level sync Worker (issue #67, Phase 2).
 *
 * Replaces `convex/sync/waterLevelUpdater.ts`. No cron trigger is declared in
 * wrangler.toml yet: this runs against a staging bucket prefix at Phase 5 before it is
 * scheduled anywhere near production data.
 */
export default {
    async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
        const result = await runSync(env);
        // A scheduled Worker has no response to inspect; `wrangler tail` and the
        // dashboard read stdout, so this line is the only observability the run has.
        // eslint-disable-next-line no-console
        console.log(
            `wl-sync: success=${result.success} changed=${result.changed} ` +
                `districts=${result.districtsCount} stations=${result.stationsCount} ` +
                `status=${result.overallStatus}${result.error ? ` error=${result.error}` : ""}`
        );
    },
};
