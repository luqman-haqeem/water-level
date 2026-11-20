import { describe, it, expect } from "vitest";
import { buildHistoryFile, historyKey, newHistoryPoints } from "../history";
import type { Trends } from "../trends";

const RUN = Date.parse("2026-11-19T03:15:07.000Z");
const pt = (timestamp: number, currentLevel = 1.5, alertLevel = 0) =>
    ({ timestamp, currentLevel, alertLevel, recordedAt: new Date(timestamp).toISOString() });


describe("historyKey", () => {
    it("is history/YYYY-MM-DD/HHMMSS.json in UTC", () => {
        expect(historyKey(RUN)).toBe("history/2026-11-19/031507.json");
    });

    it("uses the UTC date, not Malaysia time", () => {
        // 23:30 UTC is already the next day in Malaysia; keys stay on UTC.
        expect(historyKey(Date.parse("2026-11-19T23:30:00Z"))).toBe("history/2026-11-19/233000.json");
    });
});

describe("newHistoryPoints", () => {
    it("returns only the points this run appended, in compact form", () => {
        const previous: Trends = { "160": [pt(1000)] };
        const next: Trends = { "160": [pt(1000), pt(2000, 1.7, 1)], "161": [pt(2000, 3, -1)] };

        expect(newHistoryPoints(previous, next)).toEqual({
            "160": [{ t: 2000, v: 1.7, a: 1 }],
            "161": [{ t: 2000, v: 3, a: -1 }],
        });
    });

    it("does not count points that only aged out of the trend window", () => {
        const previous: Trends = { "160": [pt(1000), pt(2000)] };
        const next: Trends = { "160": [pt(2000)] };
        expect(newHistoryPoints(previous, next)).toEqual({});
    });
});

describe("buildHistoryFile", () => {
    it("builds one object holding this run's points", () => {
        const built = buildHistoryFile({}, { "160": [pt(RUN - 60_000, 4.32, 0)] }, RUN);

        expect(built!.key).toBe("history/2026-11-19/031507.json");
        expect(JSON.parse(built!.body)).toEqual({
            version: 1,
            generatedAt: "2026-11-19T03:15:07.000Z",
            items: { "160": [{ t: RUN - 60_000, v: 4.32, a: 0 }] },
        });
    });

    it("returns null when the run added no new points", () => {
        const same: Trends = { "160": [pt(1000)] };
        expect(buildHistoryFile(same, same, RUN)).toBeNull();
    });
});
