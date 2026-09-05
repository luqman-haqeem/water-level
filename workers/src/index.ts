/**
 * wl-sync — water level sync Worker.
 *
 * Phase 1 scaffold. The scheduled() handler is implemented in Phase 2, where it
 * takes over `convex/sync/waterLevelUpdater.ts` while preserving its resilience
 * behaviour: summary failure aborts and records `upstream_error`, a matching
 * fingerprint short-circuits before the district fetches, per-district failures warn
 * and continue, and the fingerprint is withheld when any district failed so the next
 * run retries.
 *
 * It deliberately does nothing yet. wrangler.toml declares no cron trigger, so this
 * cannot be scheduled by accident, and publishing nothing on a timer would look
 * healthier than it is.
 */
export default {
    async scheduled(_controller: ScheduledController, _env: Env): Promise<void> {
        throw new Error("wl-sync scheduled() is not implemented until Phase 2 (issue #67)");
    },
};
