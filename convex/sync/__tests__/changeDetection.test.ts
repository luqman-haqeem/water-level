// @vitest-environment node
import { describe, it, expect } from "vitest";
import { computeJpsFingerprint, fingerprintToRecord, latestJpsUpdate } from "../changeDetection";

const districts = [
    { districtId: 3, allLastUpdated: "29/08/2026 15:45:00" },
    { districtId: 1, allLastUpdated: "29/08/2026 16:15:00" },
];

describe("computeJpsFingerprint", () => {
    it("is order-independent and joins districtId:allLastUpdated", () => {
        expect(computeJpsFingerprint(districts)).toBe(
            "1:29/08/2026 16:15:00|3:29/08/2026 15:45:00"
        );
        expect(computeJpsFingerprint([...districts].reverse())).toBe(
            computeJpsFingerprint(districts)
        );
    });

    it("changes when any district timestamp changes", () => {
        const changed = [districts[0], { districtId: 1, allLastUpdated: "29/08/2026 16:20:00" }];
        expect(computeJpsFingerprint(changed)).not.toBe(computeJpsFingerprint(districts));
    });

    it("is empty for no districts", () => {
        expect(computeJpsFingerprint([])).toBe("");
    });
});

describe("fingerprintToRecord", () => {
    it("returns the fingerprint when every district fetch succeeded", () => {
        expect(fingerprintToRecord("x", 0)).toBe("x");
    });

    it("withholds the fingerprint when any district fetch failed", () => {
        expect(fingerprintToRecord("x", 1)).toBeUndefined();
    });
});

describe("latestJpsUpdate", () => {
    it("returns the most recent timestamp as UTC ISO", () => {
        expect(latestJpsUpdate(districts)).toBe("2026-08-29T08:15:00.000Z");
    });

    it("returns null for no districts", () => {
        expect(latestJpsUpdate([])).toBeNull();
    });
});
