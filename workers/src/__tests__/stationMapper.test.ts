import { describe, it, expect } from "vitest";
import { buildStations, toSnapshotStation } from "../stationMapper";
import type { JpsStation } from "../jps";

function jps(over: Partial<JpsStation> = {}): JpsStation {
    return {
        id: 160, stationId: "3214401", stationName: "SAUJANA AMAN", stationCode: "X", referenceName: "X",
        districtName: "KUALA SELANGOR", waterLevel: 4.32, wlth_normal: 5, wlth_alert: 6.5,
        wlth_warning: 7, wlth_danger: 7.5, waterlevelStatus: 0, stationStatus: 1,
        lastUpdate: "05/09/2026 20:00:00", latitude: "3.1", longitude: "101.5", ...over,
    };
}

describe("toSnapshotStation", () => {
    it("keeps an absent threshold absent instead of collapsing it to zero", () => {
        // `wlth_danger || 0` made `level >= danger` true for every reading, so stations
        // JPS publishes no thresholds for were classified DANGER (#73).
        const s = toSnapshotStation(jps({ wlth_danger: 0, wlth_warning: null }), "D");
        expect(s.danger_water_level).toBeNull();
        expect(s.warning_water_level).toBeNull();
    });

    it("reports no reading rather than JPS's -9999 sentinel", () => {
        expect(toSnapshotStation(jps({ waterLevel: -9999 }), "D").current_levels).toBeNull();
        expect(toSnapshotStation(jps({ waterLevel: null }), "D").current_levels).toBeNull();
    });

    it("trusts JPS's own classification when it gives one", () => {
        expect(toSnapshotStation(jps({ waterlevelStatus: 3 }), "D").current_levels!.alert_level).toBe("3");
    });

    it("falls back to thresholds when JPS reports -1", () => {
        const s = toSnapshotStation(jps({ waterlevelStatus: -1, waterLevel: 7.2 }), "D");
        expect(s.current_levels!.alert_level).toBe("2"); // >= warning 7, < danger 7.5
    });

    it("reports unknown rather than normal for a status it cannot interpret", () => {
        // Previously anything unrecognised became 0 (Normal) — a silent downgrade of a
        // reading nobody had actually classified as safe.
        expect(toSnapshotStation(jps({ waterlevelStatus: 42 }), "D").current_levels!.alert_level).toBe("-1");
    });

    it("converts the JPS timestamp out of Malaysia local time", () => {
        expect(toSnapshotStation(jps(), "D").current_levels!.updated_at).toBe("2026-09-05T12:00:00.000Z");
    });

    it("falls back to 0 for unparseable coordinates", () => {
        const s = toSnapshotStation(jps({ latitude: "", longitude: "abc" }), "D");
        expect([s.latitude, s.longitude]).toEqual([0, 0]);
    });
});

describe("buildStations", () => {
    const district = (stations: JpsStation[]) => [{ districtId: 1, districtName: "D", stations }];

    it("orders output deterministically regardless of arrival order", () => {
        // District fetches now run concurrently, so completion order varies run to run.
        // Without a sort the file would churn every publish and defeat byte-comparison.
        const a = buildStations(district([jps({ id: 300 }), jps({ id: 100 })]));
        const b = buildStations(district([jps({ id: 100 }), jps({ id: 300 })]));
        expect(a.map((s) => s.id)).toEqual(["100", "300"]);
        expect(a).toEqual(b);
    });

    it("cannot emit two entries for one JPS station", () => {
        // Production accumulated 270 documents for 177 stations. Keying on the upstream
        // id makes that impossible by construction rather than by cleanup.
        const built = buildStations(district([jps({ id: 160 }), jps({ id: 160, waterLevel: 9.9 })]));
        expect(built).toHaveLength(1);
        expect(built[0].current_levels!.current_level).toBe(9.9);
    });
});
