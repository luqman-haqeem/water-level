import { mirrorCameras } from "./cameraSync";

/**
 * wl-cameras — CCTV mirror Worker (issue #67, Phase 3).
 *
 * Separate from wl-sync deliberately: the mirror moves ~11 MB per full cycle against
 * the snapshot's ~200 KB, so it is the part most likely to need throttling or rolling
 * back, and it should be possible to do that without touching the water level sync.
 *
 * No cron trigger is declared yet — Phase 5 schedules it against a staging prefix.
 */
export default {
    async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
        const result = await mirrorCameras(env);
        // eslint-disable-next-line no-console -- `wrangler tail` is a scheduled Worker's only output
        console.log(
            `wl-cameras: uploaded=${result.uploaded}/${result.attempted}` +
                (result.skipped ? ` skipped=${result.skipped}` : "")
        );
    },
};
