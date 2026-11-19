import { describe, it, expect } from "vitest";
import { convertJpsDateToIso } from "../lib/jpsDate";
import {
    ALERT_UNKNOWN,
    applyStalenessGate,
    computeAlertLevel,
    normalizeJpsStatus,
} from "../lib/alertClassification";

describe("convertJpsDateToIso (#100)", () => {
    it("converts Malaysia time (UTC+8) to UTC", () => {
        expect(convertJpsDateToIso("21/08/2025 21:15:00")).toBe("2025-08-21T13:15:00.000Z");
    });

    it("crosses the date boundary correctly", () => {
        expect(convertJpsDateToIso("01/01/2026 03:00:00")).toBe("2025-12-31T19:00:00.000Z");
    });

    it.each([
        ["empty", ""],
        ["null", null],
        ["undefined", undefined],
        ["garbage", "not a date"],
        ["date only", "21/08/2025"],
        ["ISO instead of JPS format", "2025-08-21T21:15:00"],
        ["month 13", "21/13/2025 21:15:00"],
        ["31 Feb rollover", "31/02/2025 10:00:00"],
        ["hour 24", "21/08/2025 24:00:00"],
    ])("returns \"\" for %s input, never now", (_label, input) => {
        expect(convertJpsDateToIso(input as string)).toBe("");
    });

    it("an unparseable timestamp is stored as unknown, so it cannot page", () => {
        // Danger reading with no usable timestamp: previously stamped "now"
        // and classified as fresh Danger.
        const updatedAt = convertJpsDateToIso("");
        expect(applyStalenessGate(3, updatedAt)).toBe(ALERT_UNKNOWN);
    });
});

describe("normalizeJpsStatus (#100)", () => {
    it("keeps an explicit 0 (Normal)", () => {
        expect(normalizeJpsStatus(0)).toBe(0);
    });

    it.each([1, 2, 3, -1])("passes through %i", (s) => {
        expect(normalizeJpsStatus(s)).toBe(s);
    });

    it.each([null, undefined])("falls back to -1 for %s", (s) => {
        expect(normalizeJpsStatus(s)).toBe(-1);
    });

    it("a JPS-Normal station without thresholds classifies as Normal, not unknown", () => {
        expect(
            computeAlertLevel({
                currentWaterLevel: 1.2,
                waterlevelStatus: normalizeJpsStatus(0),
                normalLevel: 0,
                alertLevel: 0,
                warningLevel: 0,
                dangerLevel: 0,
            })
        ).toBe(0);
    });
});
