import { describe, it, expect } from "vitest";
import { getFreshnessState } from "@/lib/freshness";
import { STALENESS_THRESHOLD_MS } from "@/utils/timeUtils";

const NOW = Date.parse("2026-08-29T10:00:00.000Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("getFreshnessState", () => {
    it("is fresh while meta is loading", () => {
        expect(getFreshnessState(undefined, null, NOW)).toEqual({ kind: "fresh" });
    });

    it("is fresh when synced ok and JPS reported within the threshold", () => {
        const meta = { status: "ok" as const, syncedAt: iso(60_000), attemptedAt: iso(60_000), jpsLastUpdate: iso(STALENESS_THRESHOLD_MS - 1) };
        expect(getFreshnessState(meta, null, NOW)).toEqual({ kind: "fresh" });
    });

    it("is jps-lagging at exactly the threshold", () => {
        const meta = { status: "ok" as const, syncedAt: iso(60_000), attemptedAt: iso(60_000), jpsLastUpdate: iso(STALENESS_THRESHOLD_MS) };
        expect(getFreshnessState(meta, null, NOW)).toEqual({ kind: "jps-lagging", jpsLastUpdate: meta.jpsLastUpdate, attemptedAt: meta.attemptedAt });
    });

    it("is upstream-down on upstream_error, using failingSince and syncedAt", () => {
        const meta = { status: "upstream_error" as const, syncedAt: iso(3_600_000), attemptedAt: iso(0), jpsLastUpdate: iso(3_600_000), failingSince: iso(1_800_000), error: "HTTP 503" };
        expect(getFreshnessState(meta, null, NOW)).toEqual({ kind: "upstream-down", since: meta.failingSince, lastGood: meta.syncedAt });
    });

    it("falls back to attemptedAt when failingSince is absent", () => {
        const meta = { status: "upstream_error" as const, syncedAt: null, attemptedAt: iso(0), jpsLastUpdate: null };
        expect(getFreshnessState(meta, null, NOW)).toEqual({ kind: "upstream-down", since: meta.attemptedAt, lastGood: null });
    });

    it("is snapshot-stale when our own last attempt is older than the threshold", () => {
        const meta = { status: "ok" as const, syncedAt: iso(16 * 60_000), attemptedAt: iso(16 * 60_000), jpsLastUpdate: iso(60_000) };
        expect(getFreshnessState(meta, null, NOW)).toEqual({ kind: "snapshot-stale", attemptedAt: meta.attemptedAt });
    });

    it("is fresh when the last attempt is still inside the threshold", () => {
        const meta = { status: "ok" as const, syncedAt: iso(14 * 60_000), attemptedAt: iso(14 * 60_000), jpsLastUpdate: iso(60_000) };
        expect(getFreshnessState(meta, null, NOW)).toEqual({ kind: "fresh" });
    });

    it("prefers snapshot-stale over jps-lagging when both apply", () => {
        const meta = { status: "ok" as const, syncedAt: iso(16 * 60_000), attemptedAt: iso(16 * 60_000), jpsLastUpdate: iso(2 * 3_600_000) };
        expect(getFreshnessState(meta, null, NOW)).toEqual({ kind: "snapshot-stale", attemptedAt: meta.attemptedAt });
    });

    it("is snapshot-unreachable when the fetch fails, keeping cached lastGood", () => {
        const cached = { status: "ok" as const, syncedAt: iso(600_000), attemptedAt: iso(600_000), jpsLastUpdate: iso(600_000) };
        expect(getFreshnessState(cached, new Error("HTTP 502"), NOW)).toEqual({ kind: "snapshot-unreachable", lastGood: cached.syncedAt });
        expect(getFreshnessState(undefined, new Error("offline"), NOW)).toEqual({ kind: "snapshot-unreachable", lastGood: null });
    });
});
