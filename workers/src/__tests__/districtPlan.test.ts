import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { runSync } from "../sync";
import { SNAPSHOT_KEYS } from "../shared";
import { SYNC_STATE_KEY, type SyncStateRow } from "../syncState";

const st = (o: Partial<SyncStateRow>) => o as SyncStateRow;
import { COORDINATES_REFRESH_INTERVAL_MS, shouldFetchCoordinates } from "../districtPlan";

const T0 = Date.parse("2026-11-19T08:00:00.000Z");
const retry = { sleep: async () => {} };
const MIN = 60_000;

interface World {
    allLastUpdated: string;
    lastUpdated: Record<number, string>;
    level: Record<number, number>;
    failDistricts?: Set<number>;
}

function districtSummary(w: World) {
    return [1, 2].map((id) => ({
        districtId: id, district: `D${id}`, normal: 1, alert: 0, warning: 0, danger: 0,
        lastUpdated: w.lastUpdated[id], allLastUpdated: w.allLastUpdated,
    }));
}

function jpsStation(id: number, district: string, level: number) {
    return {
        id, stationId: String(id), stationName: `S${id}`, stationCode: "X", referenceName: "X",
        districtName: district, waterLevel: level, wlth_normal: 5, wlth_alert: 6.5, wlth_warning: 7,
        wlth_danger: 7.5, waterlevelStatus: 0, stationStatus: 1,
        lastUpdate: "19/11/2026 16:00:00", latitude: "", longitude: "",
    };
}

/** Stubs JPS from a mutable world and records which URLs were fetched. */
function stub(w: World) {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
        const u = String(url);
        calls.push(u.split("/api/")[1] ?? u);
        if (u.endsWith("/StationRiverLevels")) {
            return Response.json([
                { stationId: 101, latitude: "3.1", longitude: "101.5" },
                { stationId: 201, latitude: "3.2", longitude: "101.6" },
            ]);
        }
        if (u.includes("GetWLStationSummary")) return Response.json(districtSummary(w));
        const id = Number(u.split("/").pop());
        if (w.failDistricts?.has(id)) throw new Error("522");
        return Response.json({ stations: [jpsStation(id * 100 + 1, `D${id}`, w.level[id])] });
    }));
    return calls;
}

const districtCalls = (calls: string[]) =>
    calls.filter((c) => c.includes("GetWLAllStationData")).map((c) => Number(c.split("/").pop())).sort();
const indexCalls = (calls: string[]) => calls.filter((c) => c === "StationRiverLevels").length;

async function stations() {
    const o = await env.SNAPSHOT.get(SNAPSHOT_KEYS.stations);
    return JSON.parse(await o!.text()).items as Array<{ id: string; latitude: number;
        current_levels: { current_level: number } | null; cameras: { captured_at: string | null } | null }>;
}

beforeEach(async () => {
    await env.SYNC_STATE.delete(SYNC_STATE_KEY);
    for (const k of Object.values(SNAPSHOT_KEYS)) await env.SNAPSHOT.delete(k);
});
afterEach(() => vi.unstubAllGlobals());

function world(): World {
    return {
        allLastUpdated: "2026-11-19T16:00:00",
        lastUpdated: { 1: "2026-11-19T16:00:00", 2: "2026-11-19T16:00:00" },
        level: { 1: 1.0, 2: 2.0 },
    };
}

describe("upstream calls per run", () => {
    it("fetches every district and the index on the first run", async () => {
        const calls = stub(world());
        await runSync(env, { now: () => T0, retry });
        expect(districtCalls(calls)).toEqual([1, 2]);
        expect(indexCalls(calls)).toBe(1);
    });

    it("fetches every district again on a changed run, but not the index", async () => {
        const w = world();
        stub(w);
        await runSync(env, { now: () => T0, retry });

        w.allLastUpdated = "2026-11-19T16:15:00";
        w.lastUpdated[1] = "2026-11-19T16:15:00"; // district 2's stamp unchanged
        w.level = { 1: 1.5, 2: 2.5 };
        const calls = stub(w);
        const result = await runSync(env, { now: () => T0 + 15 * MIN, retry });

        expect(result).toMatchObject({ success: true, changed: true, stationsCount: 2 });
        expect(districtCalls(calls)).toEqual([1, 2]);
        expect(indexCalls(calls)).toBe(0); // coordinates are under a day old
        const byId = Object.fromEntries((await stations()).map((s) => [s.id, s]));
        expect(byId["201"].current_levels!.current_level).toBe(2.5);
        expect(byId["201"].latitude).toBe(3.2); // pin carried from the published snapshot
    });

    it("keeps a failed district's last published stations instead of dropping them", async () => {
        const w = world();
        stub(w);
        await runSync(env, { now: () => T0, retry });

        w.allLastUpdated = "2026-11-19T16:15:00";
        w.level = { 1: 1.5, 2: 2.5 };
        w.failDistricts = new Set([2]);
        stub(w);
        const result = await runSync(env, { now: () => T0 + 15 * MIN, retry });

        expect(result.stationsCount).toBe(2);
        const byId = Object.fromEntries((await stations()).map((s) => [s.id, s]));
        expect(byId["101"].current_levels!.current_level).toBe(1.5);
        expect(byId["201"].current_levels!.current_level).toBe(2.0); // last good reading
        expect(byId["201"].latitude).toBe(3.2);
    });

    it("retries after a partial failure even though JPS has nothing new", async () => {
        const w = world();
        stub(w);
        await runSync(env, { now: () => T0, retry });

        w.allLastUpdated = "2026-11-19T16:15:00";
        w.failDistricts = new Set([2]);
        stub(w);
        await runSync(env, { now: () => T0 + 15 * MIN, retry });

        w.failDistricts = undefined; // same summary as the failed run
        const calls = stub(w);
        const result = await runSync(env, { now: () => T0 + 30 * MIN, retry });

        expect(result.changed).toBe(true);
        expect(districtCalls(calls)).toEqual([1, 2]);
    });

    it("refreshes the camera copy on a failed district's stations so frame times keep moving", async () => {
        const w = world();
        stub(w);
        const camera = (captured_at: string) => JSON.stringify({ items: [{
            id: "c1", jps_camera_id: "77", camera_name: "C", img_url: "cam/77.jpg",
            captured_at, districts: { name: "D2" }, station_id: "201" }] });
        await env.SNAPSHOT.put(SNAPSHOT_KEYS.cameras, camera("2026-11-19T07:59:00.000Z"));
        await runSync(env, { now: () => T0, retry });

        await env.SNAPSHOT.put(SNAPSHOT_KEYS.cameras, camera("2026-11-19T08:14:00.000Z"));
        w.allLastUpdated = "2026-11-19T16:15:00";
        w.failDistricts = new Set([2]);
        stub(w);
        await runSync(env, { now: () => T0 + 15 * MIN, retry });

        const s201 = (await stations()).find((s) => s.id === "201")!;
        expect(s201.cameras!.captured_at).toBe("2026-11-19T08:14:00.000Z");
    });

    it("re-fetches the coordinate index after a day", async () => {
        const w = world();
        stub(w);
        await runSync(env, { now: () => T0, retry });

        w.allLastUpdated = "2026-11-20T16:01:00";
        const calls = stub(w);
        await runSync(env, { now: () => T0 + COORDINATES_REFRESH_INTERVAL_MS + MIN, retry });

        expect(indexCalls(calls)).toBe(1);
    });

    it("treats every district failing as an outage", async () => {
        const w = world();
        stub(w);
        await runSync(env, { now: () => T0, retry });

        w.allLastUpdated = "2026-11-19T16:15:00";
        w.failDistricts = new Set([1, 2]);
        stub(w);
        const result = await runSync(env, { now: () => T0 + 15 * MIN, retry });

        expect(result).toMatchObject({ success: false, error: "All 2 district fetches failed" });
    });
});

describe("shouldFetchCoordinates", () => {
    it("fetches when nothing published has a pin", () => {
        expect(shouldFetchCoordinates(st({ coordinatesFetchedAt: new Date(T0).toISOString() }),
            [{ latitude: 0, longitude: 0 }] as never, T0)).toBe(true);
    });
});
