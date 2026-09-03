import { describe, it, expect } from "vitest";
import { omitUndefined, parseCoordinate } from "../sync/stationUpdater";

/**
 * NOTE ON TEST COVERAGE GAP:
 *
 * The `upsertStation` mutation handler itself is not exercised here — it needs a
 * Convex `MutationCtx` with a working `db`, which cannot be instantiated under
 * Vitest without a running Convex dev server (same constraint documented in
 * notifications.test.ts).
 *
 * Mitigation: the destructive behaviour lived entirely in how the patch payload
 * was built, so the fix is extracted into the two pure functions below and the
 * regression is pinned at that level. The one-line call site
 * (`...omitUndefined(stationData)`) is verified by the Convex deploy dry-run in
 * CI and by inspecting a station document after the weekly sync runs.
 */

describe("omitUndefined", () => {
    it("drops keys whose value is undefined", () => {
        expect(omitUndefined({ a: 1, b: undefined, c: "x" })).toEqual({
            a: 1,
            c: "x",
        });
    });

    it("keeps falsy values that are not undefined", () => {
        // Regression guard: 0, "", false and null are all meaningful values that
        // must survive. Only `undefined` means "upstream didn't tell us".
        const fields = { zero: 0, empty: "", no: false, nothing: null };

        expect(omitUndefined(fields)).toEqual(fields);
    });

    it("returns an empty object when every value is undefined", () => {
        expect(omitUndefined({ a: undefined, b: undefined })).toEqual({});
    });

    it("does not mutate its input", () => {
        const input = { a: 1, b: undefined };
        omitUndefined(input);

        expect(input).toEqual({ a: 1, b: undefined });
    });

    it("omits the keys that would delete stored coordinates", () => {
        // This is the actual bug: JPS stopped returning lat/lng, so the weekly
        // sync built a payload carrying `latitude: undefined`, and patching with
        // that deleted the seeded coordinates. The patch must not mention them.
        const jpsPayloadWithNoCoordinates = {
            jpsSelId: "236",
            stationName: "KG. PASIR",
            stationStatus: true,
            latitude: undefined,
            longitude: undefined,
            dangerWaterLevel: undefined,
        };

        const patch = omitUndefined(jpsPayloadWithNoCoordinates);

        expect(patch).not.toHaveProperty("latitude");
        expect(patch).not.toHaveProperty("longitude");
        expect(patch).not.toHaveProperty("dangerWaterLevel");
        expect(patch).toEqual({
            jpsSelId: "236",
            stationName: "KG. PASIR",
            stationStatus: true,
        });
    });
});

describe("parseCoordinate", () => {
    it("parses numeric strings", () => {
        expect(parseCoordinate("3.194293")).toBe(3.194293);
        expect(parseCoordinate("101.855267")).toBe(101.855267);
    });

    it("passes through numbers", () => {
        expect(parseCoordinate(3.194293)).toBe(3.194293);
    });

    it("treats negative coordinates as valid", () => {
        expect(parseCoordinate("-3.5")).toBe(-3.5);
    });

    it('treats the string "0" as absent', () => {
        // Regression guard: `"0"` is truthy, so the previous
        // `raw ? parseFloat(raw) : undefined` returned 0 and would overwrite a
        // good stored coordinate with the Gulf of Guinea.
        expect(parseCoordinate("0")).toBeUndefined();
        expect(parseCoordinate("0.0")).toBeUndefined();
    });

    it("treats numeric 0 as absent", () => {
        expect(parseCoordinate(0)).toBeUndefined();
    });

    it("returns undefined for absent or unparseable input", () => {
        expect(parseCoordinate(undefined)).toBeUndefined();
        expect(parseCoordinate(null)).toBeUndefined();
        expect(parseCoordinate("")).toBeUndefined();
        expect(parseCoordinate("not a number")).toBeUndefined();
        expect(parseCoordinate(NaN)).toBeUndefined();
        expect(parseCoordinate({})).toBeUndefined();
    });
});
