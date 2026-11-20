import { describe, it, expect } from "vitest";
// @ts-expect-error — plain ESM script, no type declarations
import { assess, DEFAULT_MAX_AGE_MINUTES } from "../snapshotWatchdog.mjs";

const NOW = Date.parse("2026-11-20T08:00:00.000Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

describe("snapshot watchdog", () => {
    it("is quiet for a normal 45 minute gap", () => {
        expect(assess({ syncedAt: ago(45), attemptedAt: ago(5), status: "ok" }, NOW)).toMatchObject({
            stale: false,
            reason: "fresh",
            ageMinutes: 45,
        });
    });

    it("goes stale on syncedAt age even while status still says ok", () => {
        const r = assess({ syncedAt: ago(DEFAULT_MAX_AGE_MINUTES + 1), attemptedAt: ago(DEFAULT_MAX_AGE_MINUTES + 1), status: "ok" }, NOW);
        expect(r.stale).toBe(true);
        expect(r.reason).toMatch(/publishers have stopped/);
    });

    it("blames upstream when syncs are still being attempted", () => {
        const r = assess({ syncedAt: ago(180), attemptedAt: ago(10), status: "upstream_error" }, NOW);
        expect(r.stale).toBe(true);
        expect(r.reason).toMatch(/upstream \(JPS\)/);
    });

    it("reports which publisher wrote the snapshot", () => {
        expect(assess({ syncedAt: ago(5), attemptedAt: ago(5), publisher: "standby" }, NOW).publisher).toBe("standby");
        expect(assess({ syncedAt: ago(5), attemptedAt: ago(5) }, NOW).publisher).toBe("worker");
    });

    it("treats an unreachable or malformed meta.json as stale", () => {
        expect(assess(null, NOW)).toMatchObject({ stale: true, reason: "meta.json unreachable" });
        expect(assess({ status: "ok" }, NOW)).toMatchObject({ stale: true });
    });

    it("honours a custom threshold", () => {
        expect(assess({ syncedAt: ago(40), attemptedAt: ago(40) }, NOW, 30).stale).toBe(true);
    });
});
