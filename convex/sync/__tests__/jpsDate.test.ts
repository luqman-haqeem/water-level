// @vitest-environment node
import { describe, it, expect } from "vitest";
import { convertJpsDateToIso, parseJpsDateToIso } from "../jpsDate";

describe("convertJpsDateToIso", () => {
    it("converts Malaysian local time (UTC+8) to UTC ISO", () => {
        expect(convertJpsDateToIso("21/08/2025 21:15:00")).toBe("2025-08-21T13:15:00.000Z");
    });

    it("crosses the day boundary correctly", () => {
        expect(convertJpsDateToIso("01/01/2026 03:00:00")).toBe("2025-12-31T19:00:00.000Z");
    });

    it("accepts unpadded day, month and hour components", () => {
        expect(convertJpsDateToIso("1/8/2025 9:05:00")).toBe("2025-08-01T01:05:00.000Z");
    });

    it("returns an ISO string for garbage input instead of throwing", () => {
        const out = convertJpsDateToIso("not a date");
        expect(() => new Date(out).toISOString()).not.toThrow();
    });

    it("parses ISO-style local time without a zone as Malaysian time (UTC+8)", () => {
        expect(convertJpsDateToIso("2026-08-30T11:15:00")).toBe("2026-08-30T03:15:00.000Z");
    });

    it("accepts ISO-style local time with a space separator and no seconds", () => {
        expect(convertJpsDateToIso("2026-08-30 11:15")).toBe("2026-08-30T03:15:00.000Z");
    });

    it("passes through ISO strings that already carry a zone", () => {
        expect(convertJpsDateToIso("2026-08-30T03:15:00.000Z")).toBe("2026-08-30T03:15:00.000Z");
        expect(convertJpsDateToIso("2026-08-30T11:15:00+08:00")).toBe("2026-08-30T03:15:00.000Z");
    });
});

describe("parseJpsDateToIso", () => {
    it("parses the same formats convertJpsDateToIso does", () => {
        expect(parseJpsDateToIso("21/08/2025 21:15:00")).toBe("2025-08-21T13:15:00.000Z");
        expect(parseJpsDateToIso("2026-11-20T14:30:00")).toBe("2026-11-20T06:30:00.000Z");
    });

    it("returns null, not now, for missing or malformed input (#100)", () => {
        for (const bad of [undefined, null, "", "   ", "garbage", "21/08/2025", "32/13/2026 25:00:00"]) {
            expect(parseJpsDateToIso(bad)).toBeNull();
        }
    });

    it("rejects dates that would silently roll over", () => {
        expect(parseJpsDateToIso("31/02/2026 10:00:00")).toBeNull();
        expect(parseJpsDateToIso("2026-02-30T10:00:00")).toBeNull();
    });
});
