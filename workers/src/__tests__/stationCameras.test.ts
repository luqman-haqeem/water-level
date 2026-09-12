import { describe, it, expect } from "vitest";
import { indexCamerasByStation } from "../stationCameras";
import { CAMERA_STATION_LINKS } from "../cameraLinks";
import { buildStations } from "../stationMapper";
import type { CameraEntry } from "../cameraSync";
import type { JpsStation } from "../jps";

const [LINKED_CAMERA, LINKED_STATION] = Object.entries(CAMERA_STATION_LINKS)[0];

const cam = (over: Partial<CameraEntry> = {}): CameraEntry => ({
    id: LINKED_CAMERA, jps_camera_id: LINKED_CAMERA, captured_at: "2026-09-06T07:00:00.000Z",
    img_url: "https://jps.test/1.jpg", ...over,
});

function jps(id: number): JpsStation {
    return {
        id, stationId: String(id), stationName: "S", stationCode: "X", referenceName: "X",
        districtName: "D", waterLevel: 1, wlth_normal: 1, wlth_alert: 2, wlth_warning: 3,
        wlth_danger: 4, waterlevelStatus: 0, stationStatus: 1,
        lastUpdate: "06/09/2026 15:00:00", latitude: "", longitude: "",
    };
}

describe("indexCamerasByStation", () => {
    it("keys a camera by the station it watches", () => {
        const index = indexCamerasByStation([cam()]);
        expect(index[LINKED_STATION]).toMatchObject({
            jps_camera_id: LINKED_CAMERA, is_enabled: true, captured_at: "2026-09-06T07:00:00.000Z",
        });
    });

    it("prefers the roster's own station_id over the static map", () => {
        // Once the weekly refresh publishes station_id, that is the source of truth and
        // the static fallback stops mattering.
        const index = indexCamerasByStation([cam({ station_id: "999" })]);
        expect(index["999"]).toBeDefined();
        expect(index[LINKED_STATION]).toBeUndefined();
    });

    it("ignores cameras that watch no station", () => {
        expect(indexCamerasByStation([cam({ id: "999999", jps_camera_id: "999999" })])).toEqual({});
    });

    it("carries captured_at through rather than inventing one", () => {
        // The timestamp belongs to the mirror; the UI prints it as the frame's age.
        expect(indexCamerasByStation([cam({ captured_at: null })])[LINKED_STATION].captured_at).toBeNull();
    });
});

describe("stations carry their camera", () => {
    const districts = (stations: JpsStation[]) => [{ districtId: 1, districtName: "D", stations }];

    it("attaches the camera to the station that has one", () => {
        const built = buildStations(
            districts([jps(Number(LINKED_STATION))]),
            {},
            indexCamerasByStation([cam()])
        );
        // Drives the card badge, the "has a camera" filter and the detail page view —
        // publishing null here removes all three with no error.
        expect(built[0].cameras).toMatchObject({ jps_camera_id: LINKED_CAMERA, is_enabled: true });
    });

    it("leaves stations without a camera null", () => {
        const built = buildStations(districts([jps(999999)]), {}, indexCamerasByStation([cam()]));
        expect(built[0].cameras).toBeNull();
    });
});

describe("one camera per station", () => {
    it("never maps two cameras to the same station", () => {
        // A station renders a single camera, so a second entry would displace the first
        // rather than add to it — and which one won would depend on roster order.
        const byStation = new Map<string, string[]>();
        for (const [cameraId, stationId] of Object.entries(CAMERA_STATION_LINKS)) {
            byStation.set(stationId, [...(byStation.get(stationId) ?? []), cameraId]);
        }
        const clashes = [...byStation.entries()].filter(([, cams]) => cams.length > 1);
        expect(clashes).toEqual([]);
    });

    it("uses only numeric JPS ids on both sides", () => {
        // Guards a fat-fingered hand edit: a stray character here means a camera that
        // silently never appears rather than an error.
        for (const [cameraId, stationId] of Object.entries(CAMERA_STATION_LINKS)) {
            expect(cameraId).toMatch(/^\d+$/);
            expect(stationId).toMatch(/^\d+$/);
        }
    });

    it("keeps the first camera and ignores a later claim on the same station", () => {
        const index = indexCamerasByStation([
            cam(),
            cam({ id: "999", jps_camera_id: "999", station_id: LINKED_STATION }),
        ]);
        expect(index[LINKED_STATION].jps_camera_id).toBe(LINKED_CAMERA);
    });
});
