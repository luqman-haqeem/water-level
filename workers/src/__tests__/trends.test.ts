import { describe, it, expect } from "vitest";
import { appendTrends, type Trends } from "../trends";
import { TRENDS_WINDOW_MS } from "../shared";
import type { SnapshotStation } from "../stationMapper";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");

function stationAt(iso: string | null, level = 1.5): SnapshotStation {
    return {
        id: "160", station_name: "S", station_status: true, latitude: 0, longitude: 0,
        normal_water_level: null, alert_water_level: null, warning_water_level: null,
        danger_water_level: null, districts: { name: "D" }, cameras: null,
        current_levels: iso ? { current_level: level, updated_at: iso, alert_level: "0" } : null,
    };
}

describe("appendTrends", () => {
    it("appends the current reading", () => {
        const out = appendTrends({}, [stationAt("2026-09-05T11:59:00.000Z")], NOW);
        expect(out["160"]).toHaveLength(1);
        expect(out["160"][0]).toMatchObject({ currentLevel: 1.5, alertLevel: 0 });
    });

    it("drops points older than the published window", () => {
        const old = { timestamp: NOW - TRENDS_WINDOW_MS - 1000, currentLevel: 9, alertLevel: 0, recordedAt: "x" };
        const keep = { timestamp: NOW - 60_000, currentLevel: 8, alertLevel: 0, recordedAt: "y" };
        const out = appendTrends({ "160": [old, keep] }, [stationAt(null)], NOW);
        expect(out["160"].map((p) => p.currentLevel)).toEqual([8]);
    });

    it("does not re-append a reading JPS is still republishing", () => {
        // JPS repeats the same lastUpdate between refreshes. Appending each time would
        // pad the series with duplicates that render as a flat run.
        const at = "2026-09-05T11:59:00.000Z";
        const once = appendTrends({}, [stationAt(at)], NOW);
        const twice = appendTrends(once, [stationAt(at)], NOW);
        expect(twice["160"]).toHaveLength(1);
    });

    it("keeps the existing curve when a station reports no reading", () => {
        const existing: Trends = {
            "160": [{ timestamp: NOW - 60_000, currentLevel: 2, alertLevel: 0, recordedAt: "y" }],
        };
        const out = appendTrends(existing, [stationAt(null)], NOW);
        // An outage should leave the last good curve intact, not punch a hole in it.
        expect(out["160"]).toHaveLength(1);
    });

    it("drops stations that have no points left at all", () => {
        const stale = { timestamp: NOW - TRENDS_WINDOW_MS - 1, currentLevel: 1, alertLevel: 0, recordedAt: "x" };
        expect(appendTrends({ "160": [stale] }, [stationAt(null)], NOW)).toEqual({});
    });

    it("returns points in chronological order", () => {
        const later = { timestamp: NOW - 1000, currentLevel: 3, alertLevel: 0, recordedAt: "l" };
        const out = appendTrends({ "160": [later] }, [stationAt("2026-09-05T11:00:00.000Z")], NOW);
        expect(out["160"].map((p) => p.timestamp)).toEqual([...out["160"].map((p) => p.timestamp)].sort((a, b) => a - b));
    });
});
