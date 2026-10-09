import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.test");
});

import { resetSnapshotStoresForTests } from "@/hooks/useSnapshot";
import { useStations } from "@/hooks/useStations";
import { useCameras } from "@/hooks/useCameras";
import { useStationDetail } from "@/hooks/useStationDetail";
import { useStationTrend } from "@/hooks/useWaterLevelHistory";

const station = (id: string) => ({
    id, station_name: `S ${id}`, districts: { name: "D" }, current_levels: null, cameras: null,
    normal_water_level: 1, alert_water_level: 2, warning_water_level: 3, danger_water_level: 4, station_status: true,
});

function stubFiles(files: Record<string, unknown>) {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
        const name = url.split("/").pop()!.replace(".json", "");
        return Promise.resolve(new Response(JSON.stringify(files[name] ?? { items: [] }), { status: 200 }));
    }));
}

describe("snapshot-backed data hooks", () => {
    beforeEach(() => { resetSnapshotStoresForTests(); localStorage.clear(); });
    afterEach(() => vi.unstubAllGlobals());

    it("useStations returns items and isLoading until loaded", async () => {
        stubFiles({ stations: { generatedAt: "t", items: [station("a"), station("b")] } });
        const { result } = renderHook(() => useStations());
        expect(result.current.isLoading).toBe(true);
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.data?.map((s) => s.id)).toEqual(["a", "b"]);
    });

    it("useCameras returns camera items", async () => {
        stubFiles({ cameras: { generatedAt: "t", items: [{ id: "c1", camera_name: "Cam", img_url: undefined, jps_camera_id: "9", captured_at: null, districts: { name: "D" } }] } });
        const { result } = renderHook(() => useCameras());
        await waitFor(() => expect(result.current.data?.[0].jps_camera_id).toBe("9"));
    });

    it("useStationDetail finds one station by id and returns null when missing", async () => {
        stubFiles({ stations: { generatedAt: "t", items: [station("a")] } });
        const found = renderHook(() => useStationDetail("a"));
        await waitFor(() => expect(found.result.current.data?.station_name).toBe("S a"));
        const missing = renderHook(() => useStationDetail("zzz"));
        await waitFor(() => expect(missing.result.current.isLoading).toBe(false));
        expect(missing.result.current.data).toBeNull();
        expect(renderHook(() => useStationDetail(undefined)).result.current).toEqual({ data: null, isLoading: false });
    });

    it("useStationTrend returns the station's points, [] when absent, undefined while loading", async () => {
        stubFiles({ trends: { generatedAt: "t", items: { a: [{ timestamp: 1, currentLevel: 1.5, alertLevel: 0, recordedAt: "r" }] } } });
        const { result } = renderHook(() => useStationTrend("a"));
        expect(result.current.data).toBeUndefined();
        await waitFor(() => expect(result.current.data).toHaveLength(1));
        const none = renderHook(() => useStationTrend("nope"));
        await waitFor(() => expect(none.result.current.data).toEqual([]));
    });
});
