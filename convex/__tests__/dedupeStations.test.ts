import { describe, it, expect } from "vitest";
import { planStationMerge, pickLatestLevel } from "../migrations/dedupeStations";

/**
 * The mutation itself needs a Convex `MutationCtx` (see the coverage note in
 * notifications.test.ts), so it is exercised against a local backend loaded
 * with a production snapshot. The decisions it makes — which row survives and
 * what it inherits — are pinned here.
 */

type Row = Parameters<typeof planStationMerge>[0][number];

const row = (overrides: Partial<Row>): Row => ({
    _id: "id",
    _creationTime: 0,
    jpsSelId: "236",
    stationName: "BATU 20, HULU LANGAT",
    stationStatus: true,
    districtId: "d1",
    ...overrides,
});

describe("planStationMerge", () => {
    it("keeps the row that has coordinates", () => {
        const plan = planStationMerge([
            row({ _id: "old", _creationTime: 1 }),
            row({ _id: "new", _creationTime: 2, latitude: 3.19, longitude: 101.85 }),
        ]);

        expect(plan.keeper._id).toBe("new");
        expect(plan.losers.map((r) => r._id)).toEqual(["old"]);
    });

    it("keeps the oldest row when coordinates do not decide it", () => {
        const plan = planStationMerge([
            row({ _id: "new", _creationTime: 2 }),
            row({ _id: "old", _creationTime: 1 }),
        ]);

        expect(plan.keeper._id).toBe("old");
    });

    it("fills fields the keeper is missing from the duplicates, never overwriting", () => {
        const plan = planStationMerge([
            row({ _id: "keep", _creationTime: 1, latitude: 3.1, longitude: 101.8, dangerWaterLevel: 90.4 }),
            row({ _id: "dup", _creationTime: 2, latitude: 9, longitude: 9, dangerWaterLevel: 1, gsmNumber: "x", refName: "BATU20" }),
        ]);

        expect(plan.patch).toEqual({
            gsmNumber: "x",
            refName: "BATU20",
            mergedStationIds: ["dup"],
        });
    });

    it("accumulates merged ids across repeated merges", () => {
        const plan = planStationMerge([
            row({ _id: "keep", _creationTime: 1, mergedStationIds: ["earlier"] }),
            row({ _id: "dup", _creationTime: 2, mergedStationIds: ["older-dup"] }),
        ]);

        expect(plan.patch.mergedStationIds).toEqual(["earlier", "dup", "older-dup"]);
    });

    it("rejects a group with mixed JPS ids", () => {
        expect(() =>
            planStationMerge([row({ _id: "a" }), row({ _id: "b", jpsSelId: "163" })])
        ).toThrow(/same jpsSelId/);
    });
});

describe("pickLatestLevel", () => {
    it("prefers the most recent updatedAt", () => {
        expect(
            pickLatestLevel([
                { _id: "a", _creationTime: 5, updatedAt: "2026-09-15T23:00:00.000Z" },
                { _id: "b", _creationTime: 1, updatedAt: "2026-09-29T08:30:00.000Z" },
            ])?._id
        ).toBe("b");
    });

    it("falls back to creation time when updatedAt is missing", () => {
        expect(
            pickLatestLevel([
                { _id: "a", _creationTime: 5 },
                { _id: "b", _creationTime: 9 },
            ])?._id
        ).toBe("b");
    });

    it("returns undefined for no levels", () => {
        expect(pickLatestLevel([])).toBeUndefined();
    });
});
