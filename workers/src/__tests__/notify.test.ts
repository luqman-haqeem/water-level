import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { buildNotificationPayload, notifyDangerStations, stationsToNotify, type NotifiableStation } from "../notify";

const NOW = Date.parse("2026-09-06T12:00:00.000Z");

const station = (over: Partial<NotifiableStation> & { alert?: string; ageMs?: number } = {}): NotifiableStation => ({
    id: over.id ?? "160",
    station_name: over.station_name ?? "SAUJANA AMAN",
    current_levels: over.current_levels !== undefined ? over.current_levels : {
        current_level: 8.1,
        alert_level: over.alert ?? "3",
        updated_at: new Date(NOW - (over.ageMs ?? 60_000)).toISOString(),
    },
});

function stubOneSignal(response = new Response("{}", { status: 200 })) {
    const fn = vi.fn(async () => response.clone());
    vi.stubGlobal("fetch", fn);
    return fn;
}

beforeEach(async () => {
    await env.SYNC_STATE.delete("notif:160");
    await env.SYNC_STATE.delete("notif:161");
});
afterEach(() => vi.unstubAllGlobals());

describe("stationsToNotify", () => {
    it("selects only stations at danger", () => {
        const picked = stationsToNotify(
            [station({ id: "160", alert: "3" }), station({ id: "161", alert: "2" })], NOW
        );
        expect(picked.map((s) => s.id)).toEqual(["160"]);
    });

    it("ignores a danger reading older than 45 minutes", () => {
        // JPS keeps serving a station's last reading after its telemetry dies. Without
        // this, a gauge that flatlined above danger would re-alert hourly forever and
        // train people to ignore the alerts that matter.
        expect(stationsToNotify([station({ ageMs: 46 * 60_000 })], NOW)).toHaveLength(0);
        expect(stationsToNotify([station({ ageMs: 44 * 60_000 })], NOW)).toHaveLength(1);
    });

    it("ignores stations with no reading at all", () => {
        expect(stationsToNotify([station({ current_levels: null })], NOW)).toHaveLength(0);
    });
});

describe("buildNotificationPayload", () => {
    it("targets subscribers by station tag and deep-links to the station", () => {
        const p = buildNotificationPayload({
            appId: "app", stationId: "160", stationName: "SAUJANA AMAN", siteUrl: "https://x.test",
        });
        expect(p.filters).toEqual([{ field: "tag", key: "station_160", value: "true", relation: "=" }]);
        expect(p.url).toBe("https://x.test/stations/160");
        expect(p.contents.en).toContain("SAUJANA AMAN");
    });
});

describe("notifyDangerStations", () => {
    const withCreds = { ...env, ONESIGNAL_APP_ID: "app", ONESIGNAL_REST_API_KEY: "key" } as Env;

    it("sends one alert and starts the cooldown", async () => {
        const fetchFn = stubOneSignal();
        const result = await notifyDangerStations(withCreds, [station()], () => NOW);

        expect(result).toEqual({ sent: 1, skipped: 0 });
        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(await env.SYNC_STATE.get("notif:160")).toBe("1");
    });

    it("stays silent for an hour after sending", async () => {
        stubOneSignal();
        await notifyDangerStations(withCreds, [station()], () => NOW);
        const fetchFn = stubOneSignal();

        const result = await notifyDangerStations(withCreds, [station()], () => NOW + 300_000);

        expect(result).toEqual({ sent: 0, skipped: 1 });
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it("does not silence a station when OneSignal rejects the send", async () => {
        // Writing the cooldown before confirming delivery would swallow the alert for an
        // hour on a transient 500.
        stubOneSignal(new Response("nope", { status: 500 }));

        const result = await notifyDangerStations(withCreds, [station()], () => NOW);

        expect(result.sent).toBe(0);
        expect(await env.SYNC_STATE.get("notif:160")).toBeNull();
    });

    it("does not silence a station when the request throws", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));

        await expect(notifyDangerStations(withCreds, [station()], () => NOW)).resolves.toMatchObject({ sent: 0 });
        expect(await env.SYNC_STATE.get("notif:160")).toBeNull();
    });

    it("cools down each station independently", async () => {
        stubOneSignal();
        const result = await notifyDangerStations(
            withCreds, [station({ id: "160" }), station({ id: "161" })], () => NOW
        );
        expect(result.sent).toBe(2);
    });

    it("skips quietly when OneSignal is not configured", async () => {
        const fetchFn = stubOneSignal();
        // A staging deployment without secrets must still sync.
        const result = await notifyDangerStations(env as Env, [station()], () => NOW);

        expect(result).toEqual({ sent: 0, skipped: 1 });
        expect(fetchFn).not.toHaveBeenCalled();
    });
});
