// @vitest-environment node
import { describe, it, expect } from "vitest";
import { convertJpsDateToIso } from "../jpsDate";

describe("convertJpsDateToIso", () => {
    it("converts Malaysian local time (UTC+8) to UTC ISO", () => {
        expect(convertJpsDateToIso("21/08/2025 21:15:00")).toBe("2025-08-21T13:15:00.000Z");
    });

    it("crosses the day boundary correctly", () => {
        expect(convertJpsDateToIso("01/01/2026 03:00:00")).toBe("2025-12-31T19:00:00.000Z");
    });

    it("returns an ISO string for garbage input instead of throwing", () => {
        const out = convertJpsDateToIso("not a date");
        expect(() => new Date(out).toISOString()).not.toThrow();
    });
});
