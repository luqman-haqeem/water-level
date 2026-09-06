import { describe, it, expect } from "vitest";
// Vite inlines this at transform time, so the test reads the real deployed config
// rather than a copy that could drift from it.
import wranglerToml from "../../wrangler.toml?raw";
import { WEEKLY_METADATA_CRON } from "../index";

function crons(toml: string): string[] {
    const match = /\[env\.staging\.triggers\][\s\S]*?crons\s*=\s*\[([^\]]*)\]/.exec(toml);
    return match ? [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
}

describe("cron configuration", () => {
    it("declares the schedule the handler branches on", () => {
        // controller.cron reports the schedule exactly as configured. If these drift,
        // the weekly run silently falls through to the water level sync and the camera
        // roster never refreshes — no error, just stale data.
        expect(crons(wranglerToml)).toContain(WEEKLY_METADATA_CRON);
    });

    it("never uses 0 for Sunday, which Cloudflare rejects", () => {
        // Cloudflare weekdays are 1 = Sunday to 7 = Saturday, off by one from standard
        // cron. `0 2 * * 0` deploys the Worker but fails the schedule API, leaving a
        // Worker live with no trigger.
        for (const cron of crons(wranglerToml)) {
            expect(cron.split(/\s+/)[4]).not.toBe("0");
        }
    });
});
