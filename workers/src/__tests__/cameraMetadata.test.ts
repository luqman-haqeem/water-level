import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { SNAPSHOT_KEYS } from "../shared";
import { fetchCameras, publishCameras } from "../cameraMetadata";
import { CAMERA_STATION_LINKS, camerasForStations } from "../cameraLinks";
import { readElevatedStations, selectSlice, mirrorCameras, type CameraEntry } from "../cameraSync";
import { SYNC_STATE_KEY } from "../syncState";

const retry = { sleep: async () => {} };
const districts = [{ districtId: 1, district: "KUALA SELANGOR", normal: 0, alert: 0, warning: 0, danger: 0,
    lastUpdated: "", allLastUpdated: "" }];

function stubCameras(payload: unknown | Error) {
    vi.stubGlobal("fetch", vi.fn(async () => {
        if (payload instanceof Error) throw payload;
        return Response.json(payload);
    }));
}

beforeEach(async () => {
    await env.SNAPSHOT.delete(SNAPSHOT_KEYS.cameras);
    await env.SNAPSHOT.delete(SNAPSHOT_KEYS.stations);
});
afterEach(() => vi.unstubAllGlobals());

describe("fetchCameras", () => {
    it("builds entries keyed by the JPS camera id", async () => {
        stubCameras([{ id: 25, cameraName: "Rantau Panjang", imageUrl: "http://x/25.jpg" }]);
        const { cameras } = await fetchCameras("https://jps.test", districts, retry);

        expect(cameras).toHaveLength(1);
        expect(cameras[0]).toMatchObject({ id: "25", jps_camera_id: "25", camera_name: "Rantau Panjang" });
    });

    it("attaches the station a camera watches", async () => {
        // JPS publishes no camera-to-station link; it comes from cameraLinks.ts.
        const [cameraId, stationId] = Object.entries(CAMERA_STATION_LINKS)[0];
        stubCameras([{ id: Number(cameraId) }, { id: 999999 }]);

        const { cameras } = await fetchCameras("https://jps.test", districts, retry);

        expect(cameras.find((c) => c.id === cameraId)!.station_id).toBe(stationId);
        expect(cameras.find((c) => c.id === "999999")!.station_id).toBeNull();
    });

    it("drops cameras JPS marks disabled", async () => {
        stubCameras([{ id: 1 }, { id: 2, isEnabled: false }]);
        const { cameras } = await fetchCameras("https://jps.test", districts, retry);
        expect(cameras.map((c) => c.id)).toEqual(["1"]);
    });

    it("reports district failures rather than silently shortening the roster", async () => {
        stubCameras(new Error("522"));
        const { cameras, failedDistricts } = await fetchCameras("https://jps.test", districts, retry);
        expect(cameras).toHaveLength(0);
        expect(failedDistricts).toBe(1);
    });
});

describe("publishCameras", () => {
    it("preserves captured_at, which belongs to the mirror", async () => {
        const existing: CameraEntry = { id: "25", jps_camera_id: "25", captured_at: "2026-09-06T01:00:00.000Z" };
        await env.SNAPSHOT.put(SNAPSHOT_KEYS.cameras, JSON.stringify({ generatedAt: "x", items: [existing] }));

        await publishCameras(env.SNAPSHOT, [{ id: "25", jps_camera_id: "25", captured_at: null }], "now");

        const items = JSON.parse(await (await env.SNAPSHOT.get(SNAPSHOT_KEYS.cameras))!.text()).items;
        // Nulling it would tell the UI every frame is of unknown age until the rotation
        // came round again.
        expect(items[0].captured_at).toBe("2026-09-06T01:00:00.000Z");
    });
});

describe("prioritising cameras on a rising river", () => {
    it("finds cameras watching the given stations", () => {
        const [cameraId, stationId] = Object.entries(CAMERA_STATION_LINKS)[0];
        expect(camerasForStations([stationId])).toContain(cameraId);
        expect(camerasForStations(["no-such-station"]).size).toBe(0);
    });

    it("reads elevated stations from the published snapshot", async () => {
        await env.SNAPSHOT.put(SNAPSHOT_KEYS.stations, JSON.stringify({ items: [
            { id: "1", current_levels: { alert_level: "0" } },
            { id: "2", current_levels: { alert_level: "1" } },
            { id: "3", current_levels: { alert_level: "3" } },
            { id: "4", current_levels: null },
        ]}));

        expect([...(await readElevatedStations(env.SNAPSHOT))].sort()).toEqual(["2", "3"]);
    });

    it("mirrors an elevated camera even when the rotation would skip it", async () => {
        const cameras: CameraEntry[] = [
            { id: "0", jps_camera_id: "0", captured_at: null },
            { id: "1", jps_camera_id: "1", captured_at: null, station_id: "S1" },
            { id: "2", jps_camera_id: "2", captured_at: null },
        ];
        await env.SNAPSHOT.put(SNAPSHOT_KEYS.cameras, JSON.stringify({ generatedAt: "x", items: cameras }));
        await env.SNAPSHOT.put(SNAPSHOT_KEYS.stations, JSON.stringify({ items: [
            { id: "S1", current_levels: { alert_level: "3" } },
        ]}));
        await env.SYNC_STATE.put(SYNC_STATE_KEY, JSON.stringify({ lastAttemptAt: "x", lastStatus: "ok" }));
        vi.stubGlobal("fetch", vi.fn(async () =>
            new Response(new Uint8Array([0xff, 0xd8]), { headers: { "content-type": "image/jpeg" } })));

        // Slice 0 covers camera "0" only; camera "1" is elevated and must come too.
        expect(selectSlice(cameras, 0).map((c) => c.id)).toEqual(["0"]);
        const result = await mirrorCameras(env, { now: () => 0, retry });

        expect(result.attempted).toBe(2);
        expect(await env.SNAPSHOT.get("cam/1.jpg")).not.toBeNull();
    });
});
