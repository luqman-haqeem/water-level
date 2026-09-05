import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { runSync } from "../sync";
import { SNAPSHOT_KEYS } from "../shared";
import { SYNC_STATE_KEY, type SyncStateRow } from "../syncState";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");
const now = () => NOW;
// Exercise the retry path without paying its 5 s backoff.
const retry = { sleep: async () => {} };

function summary(allLastUpdated = "2026-09-05T20:00:00") {
    return [{ districtId: 1, district: "KUALA SELANGOR", normal: 1, alert: 0, warning: 0, danger: 0,
        lastUpdated: allLastUpdated, allLastUpdated }];
}

function station(over: Record<string, unknown> = {}) {
    return {
        id: 160, stationId: "3214401", stationName: "SAUJANA AMAN", stationCode: "X", referenceName: "X",
        districtName: "KUALA SELANGOR", waterLevel: 4.32, wlth_normal: 5, wlth_alert: 6.5,
        wlth_warning: 7, wlth_danger: 7.5, waterlevelStatus: 0, stationStatus: 1,
        // Real district payloads send an empty string for both coordinates, always.
        lastUpdate: "05/09/2026 20:00:00", latitude: "", longitude: "", ...over,
    };
}

/** Routes stubbed fetches by URL so each test states only what it cares about. */
function stubFetch(routes: {
    summary?: unknown | Error;
    districts?: Record<number, unknown | Error>;
    index?: unknown | Error;
}) {
    const fn = vi.fn(async (url: string | URL) => {
        const u = String(url);
        if (u.endsWith("/StationRiverLevels")) {
            if (routes.index instanceof Error) throw routes.index;
            return Response.json(routes.index ?? [{ stationId: 160, latitude: "3.1", longitude: "101.5" }]);
        }
        if (u.includes("GetWLStationSummary")) {
            if (routes.summary instanceof Error) throw routes.summary;
            return Response.json(routes.summary ?? summary());
        }
        const id = Number(u.split("/").pop());
        const d = routes.districts?.[id];
        if (d instanceof Error) throw d;
        return Response.json(d ?? { stations: [station()] });
    });
    vi.stubGlobal("fetch", fn);
    return fn;
}

async function readJson(key: string) {
    const o = await env.SNAPSHOT.get(key);
    return o ? JSON.parse(await o.text()) : null;
}
const readState = async (): Promise<SyncStateRow | null> =>
    await env.SYNC_STATE.get<SyncStateRow>(SYNC_STATE_KEY, "json");

beforeEach(async () => {
    await env.SYNC_STATE.delete(SYNC_STATE_KEY);
    for (const k of Object.values(SNAPSHOT_KEYS)) await env.SNAPSHOT.delete(k);
});
afterEach(() => vi.unstubAllGlobals());

describe("happy path", () => {
    it("publishes stations, trends and meta", async () => {
        stubFetch({});
        const result = await runSync(env, { now, retry });

        expect(result).toMatchObject({ success: true, changed: true, stationsCount: 1, overallStatus: "NORMAL" });
        const stations = await readJson(SNAPSHOT_KEYS.stations);
        expect(stations.items).toHaveLength(1);
        expect(stations.items[0]).toMatchObject({
            id: "160", station_name: "SAUJANA AMAN", station_status: true,
            current_levels: { current_level: 4.32, alert_level: "0", updated_at: "2026-09-05T12:00:00.000Z" },
        });
        expect((await readJson(SNAPSHOT_KEYS.meta)).status).toBe("ok");
    });

    it("identifies stations by the JPS id, not a database id", async () => {
        // The whole reason the port is possible: JPS owns this value, so it survives
        // dropping Convex and cannot duplicate the way jpsSelId+.first() did.
        stubFetch({});
        await runSync(env, { now, retry });
        expect((await readJson(SNAPSHOT_KEYS.stations)).items[0].id).toBe("160");
        expect(Object.keys((await readJson(SNAPSHOT_KEYS.trends)).items)).toEqual(["160"]);
    });

    it("excludes stations JPS does not mark active", async () => {
        // Publishing these is why the app listed stations that had never reported (#85).
        stubFetch({ districts: { 1: { stations: [station(), station({ id: 999, stationStatus: 0 })] } } });
        await runSync(env, { now, retry });
        expect((await readJson(SNAPSHOT_KEYS.stations)).items.map((s: { id: string }) => s.id)).toEqual(["160"]);
    });
});

describe("upstream failure", () => {
    it("records upstream_error and does not touch stations.json when the summary fails", async () => {
        await env.SNAPSHOT.put(SNAPSHOT_KEYS.stations, JSON.stringify({ items: ["last good"] }));
        stubFetch({ summary: new Error("connect ETIMEDOUT") });

        const result = await runSync(env, { now, retry });

        expect(result).toMatchObject({ success: false, changed: false });
        expect((await readState())!.lastStatus).toBe("upstream_error");
        // Last good data must survive an outage — this is the app's whole fallback story.
        expect((await readJson(SNAPSHOT_KEYS.stations)).items).toEqual(["last good"]);
        expect((await readJson(SNAPSHOT_KEYS.meta)).status).toBe("upstream_error");
    });

    it("treats every district failing as an outage rather than a sync of zero stations", async () => {
        await env.SNAPSHOT.put(SNAPSHOT_KEYS.stations, JSON.stringify({ items: ["last good"] }));
        stubFetch({ districts: { 1: new Error("522") } });

        const result = await runSync(env, { now, retry });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/All 1 district fetches failed/);
        // Publishing an empty list here would blank every station in the app.
        expect((await readJson(SNAPSHOT_KEYS.stations)).items).toEqual(["last good"]);
    });

    it("keeps one district's failure from losing the others", async () => {
        stubFetch({
            summary: [...summary(), { ...summary()[0], districtId: 2, district: "KLANG" }],
            districts: { 1: { stations: [station()] }, 2: new Error("522") },
        });

        const result = await runSync(env, { now, retry });

        expect(result.success).toBe(true);
        expect((await readJson(SNAPSHOT_KEYS.stations)).items).toHaveLength(1);
    });

    it("withholds the fingerprint when any district failed, so the next run retries", async () => {
        stubFetch({
            summary: [...summary(), { ...summary()[0], districtId: 2, district: "KLANG" }],
            districts: { 1: { stations: [station()] }, 2: new Error("522") },
        });
        await runSync(env, { now, retry });
        expect((await readState())!.lastJpsFingerprint).toBeUndefined();
    });

    it("dates an outage from its first failure, not the latest one", async () => {
        stubFetch({ summary: new Error("down") });
        await runSync(env, { now, retry });
        const first = (await readState())!.failingSince;

        await runSync(env, { now: () => NOW + 600_000, retry });
        // Resetting this every run would report a two-hour outage as five minutes old.
        expect((await readState())!.failingSince).toBe(first);
    });

    it("clears the outage marker once a run succeeds", async () => {
        stubFetch({ summary: new Error("down") });
        await runSync(env, { now, retry });
        stubFetch({});
        await runSync(env, { now: () => NOW + 600_000, retry });

        const state = (await readState())!;
        expect(state.failingSince).toBeUndefined();
        expect(state.lastError).toBeUndefined();
        expect(state.lastStatus).toBe("ok");
    });

    it("keeps the last good syncedAt through a failure", async () => {
        stubFetch({});
        await runSync(env, { now, retry });
        const syncedAt = (await readState())!.lastSyncedAt;

        stubFetch({ summary: new Error("down") });
        await runSync(env, { now: () => NOW + 600_000, retry });

        // meta.json reports this as "data as of"; clearing it would make the UI claim
        // there had never been a successful sync.
        expect((await readState())!.lastSyncedAt).toBe(syncedAt);
    });
});

describe("change detection", () => {
    it("skips the district fetches entirely when JPS has not moved", async () => {
        const fetchFn = stubFetch({});
        await runSync(env, { now, retry });
        const afterFirst = fetchFn.mock.calls.length;

        const result = await runSync(env, { now: () => NOW + 300_000, retry });

        expect(result.changed).toBe(false);
        // Exactly one more call: the summary. Not fetching districts is the saving.
        expect(fetchFn.mock.calls.length).toBe(afterFirst + 1);
    });

    it("still refreshes meta on an unchanged run, so the UI sees we are alive", async () => {
        stubFetch({});
        await runSync(env, { now, retry });
        await runSync(env, { now: () => NOW + 300_000, retry });

        expect((await readJson(SNAPSHOT_KEYS.meta)).attemptedAt).toBe(new Date(NOW + 300_000).toISOString());
    });

    it("rebuilds when a district timestamp advances", async () => {
        stubFetch({});
        await runSync(env, { now, retry });
        stubFetch({ summary: summary("2026-09-05T20:15:00") });

        expect((await runSync(env, { now: () => NOW + 900_000, retry })).changed).toBe(true);
    });
});

describe("publish ordering", () => {
    it("never lets meta describe data it has not published", async () => {
        stubFetch({});
        const order: string[] = [];
        const put = env.SNAPSHOT.put.bind(env.SNAPSHOT);
        vi.spyOn(env.SNAPSHOT, "put").mockImplementation(async (k: string, ...rest: unknown[]) => {
            order.push(k);
            // @ts-expect-error variadic passthrough
            return put(k, ...rest);
        });

        await runSync(env, { now, retry });

        expect(order.at(-1)).toBe(SNAPSHOT_KEYS.meta);
        vi.restoreAllMocks();
    });

    it("does not write cameras.json, which another Worker owns", async () => {
        await env.SNAPSHOT.put(SNAPSHOT_KEYS.cameras, JSON.stringify({ items: ["camera data"] }));
        stubFetch({});
        await runSync(env, { now, retry });
        // Writing an empty one from here would blank every camera in the app.
        expect((await readJson(SNAPSHOT_KEYS.cameras)).items).toEqual(["camera data"]);
    });
});

describe("coordinates", () => {
    it("takes coordinates from the station index, not the district data", async () => {
        // The district endpoint sends an empty string for every coordinate — 0 of 176
        // stations carry them — so this is the only source.
        stubFetch({});
        await runSync(env, { now, retry });

        const s = (await readJson(SNAPSHOT_KEYS.stations)).items[0];
        expect([s.latitude, s.longitude]).toEqual([3.1, 101.5]);
    });

    it("carries the last known pins forward when the index fetch fails", async () => {
        stubFetch({});
        await runSync(env, { now, retry });

        // Index down, readings fine — the common case, since that endpoint is the
        // slowest and flakiest of the three.
        stubFetch({ index: new Error("522"), summary: summary("2026-09-05T20:15:00") });
        const result = await runSync(env, { now: () => NOW + 900_000, retry });

        expect(result.success).toBe(true);
        const s = (await readJson(SNAPSHOT_KEYS.stations)).items[0];
        expect([s.latitude, s.longitude]).toEqual([3.1, 101.5]);
    });

    it("falls back to no pin rather than a wrong one", async () => {
        stubFetch({ index: new Error("522") });
        await runSync(env, { now, retry });

        const s = (await readJson(SNAPSHOT_KEYS.stations)).items[0];
        expect([s.latitude, s.longitude]).toEqual([0, 0]);
    });

    it("does not fail the run when the index is unreachable", async () => {
        stubFetch({ index: new Error("522") });
        expect((await runSync(env, { now, retry })).success).toBe(true);
    });
});
