import { describe, it, expect } from "vitest";
// Vite inlines this at transform time, so the test reads the real deployed config
// rather than a copy that could drift from it.
import wranglerToml from "../../wrangler.toml?raw";
import camerasToml from "../../wrangler.cameras.toml?raw";
import { WEEKLY_METADATA_CRON } from "../index";
import { SLICE_INTERVAL_MS } from "../cameraSync";

function crons(toml: string): string[] {
    const match = /\[env\.staging\.triggers\][\s\S]*?crons\s*=\s*\[([^\]]*)\]/.exec(toml);
    return match ? [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
}

// Minutes from a step schedule such as `every 15 minutes`. Written as a line
// comment on purpose: the cron syntax contains a comment terminator.
function periodMinutes(cron: string): number | null {
    const m = /^\*\/(\d+) \* \* \* \*$/.exec(cron.trim());
    return m ? Number(m[1]) : null;
}

describe("cron configuration", () => {
    it("mirrors cameras exactly as often as the slice index advances", () => {
        // The slice comes from the clock: floor(now / SLICE_INTERVAL_MS) % SLICE_COUNT.
        // If the cron fires less often than SLICE_INTERVAL_MS the index skips slices; if
        // it fires more often it repeats them. At a 15-minute cron with a 5-minute
        // interval every run selects slice 0, so two thirds of the roster would freeze
        // permanently — no error, just frames that quietly stop updating.
        const period = crons(camerasToml).map(periodMinutes).find((p) => p !== null);
        expect(period).not.toBeNull();
        expect(period! * 60 * 1000).toBe(SLICE_INTERVAL_MS);
    });

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
