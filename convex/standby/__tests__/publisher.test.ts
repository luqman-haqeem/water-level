import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runStandbyPublish } from "../publisher";
import type { R2Client } from "../../lib/r2";
import { SNAPSHOT_KEYS } from "../../sync/snapshotBuilder";

const BASE = "https://jps.test/api";
// Skip the 5 s retry backoff; the retry path itself is covered in the Worker suite.
const RETRY = { retries: 0, backoffMs: 0 };
const NOW = Date.parse("2026-09-12T12:00:00.000Z");
const STALE_META = JSON.stringify({
    syncedAt: "2026-09-12T06:00:00.000Z",
    attemptedAt: "2026-09-12T06:00:00.000Z",
    jpsLastUpdate: "2026-09-12T06:00:00.000Z",
    status: "ok",
});

const summary = [
    {
        districtId: 1,
        district: "GOMBAK",
        normal: 1,
        alert: 0,
        warning: 0,
        danger: 0,
        lastUpdated: "12/09/2026 11:45:00",
        allLastUpdated: "12/09/2026 11:45:00",
    },
];

const station = {
    id: 101,
    stationId: "101",
    stationName: "Sungai Test",
    stationCode: "ST1",
    referenceName: "Test",
    districtName: "GOMBAK",
    waterLevel: 12.5,
    wlth_normal: 10,
    wlth_alert: 20,
    wlth_warning: 30,
    wlth_danger: 40,
    waterlevelStatus: 0,
    stationStatus: 1,
    lastUpdate: "12/09/2026 11:45:00",
    latitude: "3.25",
    longitude: "101.65",
};

/** Bucket double: records every write and serves whatever has been seeded. */
function fakeR2(seed: Record<string, string> = {}) {
    const puts: Array<{ key: string; body: string }> = [];
    const store: Record<string, string> = { ...seed };
    const client: R2Client = {
        async getObject(key) {
            return store[key] ?? null;
        },
        async putObject(key, body) {
            const text = typeof body === "string" ? body : new TextDecoder().decode(body);
            puts.push({ key, body: text });
            store[key] = text;
        },
    };
    return { client, puts };
}

function stubJps(overrides: { districtFails?: boolean } = {}) {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("GetWLStationSummary")) return Response.json(summary);
            if (url.includes("GetWLAllStationData")) {
                if (overrides.districtFails) return new Response("nope", { status: 500 });
                return Response.json({ stations: [station] });
            }
            if (url.endsWith("/StationRiverLevels")) return Response.json([]);
            throw new Error(`unexpected fetch: ${url}`);
        })
    );
}

describe("runStandbyPublish", () => {
    beforeEach(() => vi.useFakeTimers().setSystemTime(NOW));
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("stands down without touching JPS while the Worker is healthy", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        const fresh = JSON.stringify({ attemptedAt: new Date(NOW - 60_000).toISOString(), status: "ok" });
        const { client, puts } = fakeR2({ [SNAPSHOT_KEYS.meta]: fresh });

        const result = await runStandbyPublish(client, { now: () => NOW, baseUrl: BASE, retry: RETRY });

        expect(result).toMatchObject({ published: false, reason: "worker-healthy" });
        expect(puts).toEqual([]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("publishes stations, trends and meta when the snapshot has gone stale", async () => {
        stubJps();
        const { client, puts } = fakeR2({ [SNAPSHOT_KEYS.meta]: STALE_META });

        const result = await runStandbyPublish(client, { now: () => NOW, baseUrl: BASE, retry: RETRY });

        expect(result).toMatchObject({ published: true, reason: "snapshot-stale", stationsCount: 1 });
        expect(puts.map((p) => p.key)).toEqual([
            SNAPSHOT_KEYS.trends,
            SNAPSHOT_KEYS.stations,
            SNAPSHOT_KEYS.meta,
        ]);
    });

    it("never republishes cameras.json, the file that made Convex expensive", async () => {
        stubJps();
        const { client, puts } = fakeR2({ [SNAPSHOT_KEYS.meta]: STALE_META });

        await runStandbyPublish(client, { now: () => NOW, baseUrl: BASE, retry: RETRY });

        expect(puts.map((p) => p.key)).not.toContain(SNAPSHOT_KEYS.cameras);
    });

    it("writes meta.json last, so it can never advertise data that is not there yet", async () => {
        stubJps();
        const { client, puts } = fakeR2({ [SNAPSHOT_KEYS.meta]: STALE_META });

        await runStandbyPublish(client, { now: () => NOW, baseUrl: BASE, retry: RETRY });

        expect(puts[puts.length - 1].key).toBe(SNAPSHOT_KEYS.meta);
    });

    it("publishes the JPS ids the Worker publishes, not Convex document ids", async () => {
        stubJps();
        const { client, puts } = fakeR2({ [SNAPSHOT_KEYS.meta]: STALE_META });

        await runStandbyPublish(client, { now: () => NOW, baseUrl: BASE, retry: RETRY });

        const stations = JSON.parse(puts.find((p) => p.key === SNAPSHOT_KEYS.stations)!.body);
        expect(stations.items[0].id).toBe("101");
        expect(stations.items[0].station_name).toBe("Sungai Test");
    });

    it("carries published coordinates forward when the index endpoint gives nothing", async () => {
        stubJps();
        const previous = JSON.stringify({
            generatedAt: "2026-09-12T06:00:00.000Z",
            items: [{ id: "101", latitude: 3.1, longitude: 101.1 }],
        });
        const { client, puts } = fakeR2({
            [SNAPSHOT_KEYS.meta]: STALE_META,
            [SNAPSHOT_KEYS.stations]: previous,
        });

        await runStandbyPublish(client, { now: () => NOW, baseUrl: BASE, retry: RETRY });

        const stations = JSON.parse(puts.find((p) => p.key === SNAPSHOT_KEYS.stations)!.body);
        expect(stations.items[0].latitude).toBe(3.1);
    });

    it("appends to the published trend window instead of restarting it", async () => {
        stubJps();
        const earlier = Date.parse("2026-09-12T11:00:00.000Z");
        const { client, puts } = fakeR2({
            [SNAPSHOT_KEYS.meta]: STALE_META,
            [SNAPSHOT_KEYS.trends]: JSON.stringify({
                generatedAt: "2026-09-12T11:00:00.000Z",
                items: {
                    "101": [
                        {
                            timestamp: earlier,
                            currentLevel: 11,
                            alertLevel: 0,
                            recordedAt: "2026-09-12T11:00:00.000Z",
                        },
                    ],
                },
            }),
        });

        await runStandbyPublish(client, { now: () => NOW, baseUrl: BASE, retry: RETRY });

        const trends = JSON.parse(puts.find((p) => p.key === SNAPSHOT_KEYS.trends)!.body);
        expect(trends.items["101"]).toHaveLength(2);
    });

    it("refuses to blank the app when every district fails", async () => {
        stubJps({ districtFails: true });
        const { client, puts } = fakeR2({ [SNAPSHOT_KEYS.meta]: STALE_META });

        const result = await runStandbyPublish(client, { now: () => NOW, baseUrl: BASE, retry: RETRY });

        expect(result).toMatchObject({ published: false, reason: "upstream-error" });
        expect(puts).toEqual([]);
    });

    it("skips the cycle when R2 cannot be read, since it could not be written either", async () => {
        stubJps();
        const client: R2Client = {
            async getObject() {
                throw new Error("R2 GET meta.json failed: HTTP 403");
            },
            async putObject() {
                throw new Error("should not be called");
            },
        };

        const result = await runStandbyPublish(client, { now: () => NOW, baseUrl: BASE, retry: RETRY });

        expect(result).toEqual({ published: false, reason: "r2-unreachable" });
    });
});
