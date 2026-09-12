import { describe, it, expect } from "vitest";
import { decideStandby } from "../decide";
import { STALENESS_THRESHOLD_MS } from "../../lib/retention";

const NOW = Date.parse("2026-09-12T12:00:00.000Z");
const meta = (attemptedAt: string, status = "ok") =>
    JSON.stringify({ syncedAt: attemptedAt, attemptedAt, jpsLastUpdate: null, status });

describe("decideStandby", () => {
    it("stands down while the Worker is publishing", () => {
        const fresh = new Date(NOW - 10 * 60_000).toISOString();
        expect(decideStandby(meta(fresh), NOW)).toEqual({
            publish: false,
            reason: "worker-healthy",
            ageMs: 10 * 60_000,
        });
    });

    it("takes over once the snapshot passes the staleness threshold", () => {
        const stale = new Date(NOW - 3 * 60 * 60_000).toISOString();
        const decision = decideStandby(meta(stale), NOW);
        expect(decision.publish).toBe(true);
        expect(decision.reason).toBe("snapshot-stale");
    });

    it("holds off right up to the threshold and acts once past it", () => {
        const at = (ms: number) => new Date(NOW - ms).toISOString();
        expect(decideStandby(meta(at(STALENESS_THRESHOLD_MS - 1)), NOW).publish).toBe(false);
        expect(decideStandby(meta(at(STALENESS_THRESHOLD_MS)), NOW).publish).toBe(true);
    });

    it("publishes when meta.json has never been written", () => {
        expect(decideStandby(null, NOW)).toEqual({ publish: true, reason: "meta-missing" });
    });

    it("publishes rather than guessing when meta.json is unparseable", () => {
        expect(decideStandby("<html>502 Bad Gateway</html>", NOW).reason).toBe("meta-unreadable");
    });

    it("publishes when attemptedAt is missing or not a date", () => {
        expect(decideStandby(JSON.stringify({ status: "ok" }), NOW).reason).toBe("meta-unreadable");
        expect(decideStandby(meta("not-a-date"), NOW).reason).toBe("meta-unreadable");
    });

    it("ignores status: an honest upstream_error still proves the Worker is running", () => {
        const fresh = new Date(NOW - 60_000).toISOString();
        expect(decideStandby(meta(fresh, "upstream_error"), NOW).publish).toBe(false);
    });

    it("does not read a future timestamp as ancient", () => {
        const ahead = new Date(NOW + 5 * 60_000).toISOString();
        expect(decideStandby(meta(ahead), NOW).publish).toBe(false);
    });
});
