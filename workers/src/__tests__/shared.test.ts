import { describe, it, expect } from "vitest";
import {
    SNAPSHOT_KEYS,
    buildDataFiles,
    buildMetaFile,
    cameraImageKey,
    computeJpsFingerprint,
    convertJpsDateToIso,
    metaFromSyncState,
    TRENDS_WINDOW_MS,
    HISTORY_RETENTION_MS,
} from "../shared";

/**
 * These modules are already covered by the Convex suite. The point here is different:
 * prove they behave the same inside workerd, which has a different global scope and a
 * different JSON/Date implementation path than Node. A pass means the Phase 2 port can
 * treat them as settled.
 */
describe("pure modules under workerd", () => {
    it("reads both zone-less JPS formats as Malaysia time and normalises to UTC", () => {
        // The single highest-risk behaviour in the port. Both formats are wall-clock
        // Asia/Kuala_Lumpur (UTC+8) with no zone marker, so a runtime that resolved them
        // against its own locale would shift every reading by 8 hours — wrong, but
        // plausible enough to survive review. Pin the arithmetic explicitly.
        expect(convertJpsDateToIso("02/09/2026 14:15:00")).toBe("2026-09-02T06:15:00.000Z");
        expect(convertJpsDateToIso("2026-09-02T14:15:00")).toBe("2026-09-02T06:15:00.000Z");
    });

    it("accepts the unpadded day/month/hour JPS sometimes emits", () => {
        expect(convertJpsDateToIso("1/8/2025 9:05:00")).toBe("2025-08-01T01:05:00.000Z");
    });

    it("honours an explicit zone rather than shifting it again", () => {
        expect(convertJpsDateToIso("2026-09-02T14:15:00Z")).toBe("2026-09-02T14:15:00.000Z");
    });

    it("fingerprints districts stably regardless of order", () => {
        const a = computeJpsFingerprint([
            { districtId: 1, allLastUpdated: "2026-09-02T14:30:00" },
            { districtId: 4, allLastUpdated: "2026-09-02T14:15:00" },
        ]);
        const b = computeJpsFingerprint([
            { districtId: 4, allLastUpdated: "2026-09-02T14:15:00" },
            { districtId: 1, allLastUpdated: "2026-09-02T14:30:00" },
        ]);
        expect(a).toBe(b);
    });

    it("changes the fingerprint when any district timestamp moves", () => {
        const before = computeJpsFingerprint([{ districtId: 1, allLastUpdated: "2026-09-02T14:30:00" }]);
        const after = computeJpsFingerprint([{ districtId: 1, allLastUpdated: "2026-09-02T14:35:00" }]);
        expect(after).not.toBe(before);
    });

    it("keeps retention independent of the published trend window", () => {
        // These were the same constant by coincidence, which is why every history row
        // was deleted as soon as it left the chart (#80). They must not re-converge.
        expect(TRENDS_WINDOW_MS).toBe(3 * 60 * 60 * 1000);
        expect(HISTORY_RETENTION_MS).toBeGreaterThan(TRENDS_WINDOW_MS);
    });

    it("builds the exact public key set the frontend reads", () => {
        const files = buildDataFiles({ stations: [], cameras: [], trends: {}, generatedAt: "2026-09-02T00:00:00.000Z" });
        files.push(buildMetaFile(metaFromSyncState(null, "2026-09-02T00:00:00.000Z")));
        expect(files.map((f) => f.key).sort()).toEqual(
            [SNAPSHOT_KEYS.trends, SNAPSHOT_KEYS.cameras, SNAPSHOT_KEYS.stations, SNAPSHOT_KEYS.meta].sort()
        );
    });

    it("wraps data files in the {generatedAt, items} envelope", () => {
        const [trends] = buildDataFiles({
            stations: [], cameras: [], trends: { "3214401": [{ v: 1 }] }, generatedAt: "2026-09-02T00:00:00.000Z",
        });
        expect(JSON.parse(trends.body)).toEqual({
            generatedAt: "2026-09-02T00:00:00.000Z",
            items: { "3214401": [{ v: 1 }] },
        });
    });

    describe("camera key guard", () => {
        it("accepts real JPS ids", () => {
            expect(cameraImageKey("25")).toBe("cam/25.jpg");
        });

        it("refuses ids that would escape the cam/ prefix", () => {
            // Under aws4fetch the key was interpolated into a URL and `..` collapsed, so
            // this overwrote stations.json — the object the whole app reads. The native
            // R2 binding does not parse the key, but the guard ports anyway.
            expect(() => cameraImageKey("../stations.json")).toThrow(/unsafe camera id/i);
            expect(() => cameraImageKey("")).toThrow(/unsafe camera id/i);
            expect(() => cameraImageKey("25/../../evil")).toThrow(/unsafe camera id/i);
        });
    });
});
