import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { SNAPSHOT_KEYS } from "../shared";
import { SYNC_STATE_KEY, type SyncStateRow } from "../syncState";
import { SLICE_COUNT, mirrorCameras, selectSlice, sliceIndex, type CameraEntry } from "../cameraSync";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");
const retry = { sleep: async () => {} };

const camera = (n: number): CameraEntry => ({
    id: `cam-${n}`, jps_camera_id: String(n), captured_at: null, camera_name: `C${n}`,
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

function stubFrames(behaviour: (id: string) => Response | Error = () => new Response(JPEG, {
    headers: { "content-type": "image/jpeg" },
})) {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
        const id = String(url).split("/").pop()!.replace(".jpg", "");
        const out = behaviour(id);
        if (out instanceof Error) throw out;
        return out;
    }));
}

async function putCameras(items: CameraEntry[]) {
    await env.SNAPSHOT.put(SNAPSHOT_KEYS.cameras, JSON.stringify({ generatedAt: "x", items }));
}
const okState: SyncStateRow = { lastAttemptAt: "x", lastStatus: "ok" };

beforeEach(async () => {
    await env.SYNC_STATE.put(SYNC_STATE_KEY, JSON.stringify(okState));
    await env.SNAPSHOT.delete(SNAPSHOT_KEYS.cameras);
    for (let i = 0; i < 10; i++) await env.SNAPSHOT.delete(`cam/${i}.jpg`);
});
afterEach(() => vi.unstubAllGlobals());

describe("slice rotation", () => {
    it("covers every camera exactly once across the three slices", () => {
        // The property that matters: no camera is skipped and none is mirrored twice,
        // whatever the list length. A hash-based split would not guarantee this.
        const cameras = Array.from({ length: 92 }, (_, i) => camera(i));
        const seen = Array.from({ length: SLICE_COUNT }, (_, s) =>
            selectSlice(cameras, s * 5 * 60 * 1000)
        ).flat();

        expect(seen).toHaveLength(92);
        expect(new Set(seen.map((c) => c.id)).size).toBe(92);
    });

    it("advances one slice per five minutes and wraps", () => {
        expect(sliceIndex(0)).toBe(0);
        expect(sliceIndex(5 * 60 * 1000)).toBe(1);
        expect(sliceIndex(10 * 60 * 1000)).toBe(2);
        expect(sliceIndex(15 * 60 * 1000)).toBe(0);
    });

    it("needs no stored cursor, so a missed run cannot stall the rotation", () => {
        // Same clock in, same slice out — a retry re-mirrors its own third rather than
        // skipping one, which is what a persisted cursor would risk.
        const cameras = Array.from({ length: 9 }, (_, i) => camera(i));
        expect(selectSlice(cameras, NOW)).toEqual(selectSlice(cameras, NOW));
    });
});

describe("mirrorCameras", () => {
    it("mirrors its slice to cam/{id}.jpg", async () => {
        await putCameras([camera(0), camera(1), camera(2)]);
        stubFrames();

        const result = await mirrorCameras(env, { now: () => 0, retry });

        expect(result.uploaded).toBe(1); // slice 0 of 3
        const stored = await env.SNAPSHOT.get("cam/0.jpg");
        expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(JPEG);
        expect(stored!.httpMetadata?.contentType).toBe("image/jpeg");
    });

    it("does not call JPS at all while the water level sync reports an outage", async () => {
        await env.SYNC_STATE.put(SYNC_STATE_KEY, JSON.stringify({ ...okState, lastStatus: "upstream_error" }));
        await putCameras([camera(0)]);
        stubFrames();

        const result = await mirrorCameras(env, { now: () => 0, retry });

        expect(result).toMatchObject({ attempted: 0, uploaded: 0, skipped: "upstream_error" });
        expect(fetch).not.toHaveBeenCalled();
    });

    it("keeps the previous frame when a camera fails", async () => {
        await env.SNAPSHOT.put("cam/0.jpg", new Uint8Array([1, 2, 3]));
        await putCameras([camera(0)]);
        stubFrames(() => new Error("connect ETIMEDOUT"));

        await mirrorCameras(env, { now: () => 0, retry });

        // A stale frame beats a broken image, and in an outage every camera fails.
        expect(new Uint8Array(await (await env.SNAPSHOT.get("cam/0.jpg"))!.arrayBuffer()))
            .toEqual(new Uint8Array([1, 2, 3]));
    });

    it("rejects an HTML error page served with a 200", async () => {
        await env.SNAPSHOT.put("cam/0.jpg", JPEG);
        await putCameras([camera(0)]);
        stubFrames(() => new Response("<html>camera offline</html>", {
            headers: { "content-type": "text/html" },
        }));

        const result = await mirrorCameras(env, { now: () => 0, retry });

        expect(result.uploaded).toBe(0);
        expect(new Uint8Array(await (await env.SNAPSHOT.get("cam/0.jpg"))!.arrayBuffer())).toEqual(JPEG);
    });

    it("rejects an empty body", async () => {
        await putCameras([camera(0)]);
        stubFrames(() => new Response(new Uint8Array(), { headers: { "content-type": "image/jpeg" } }));

        expect((await mirrorCameras(env, { now: () => 0, retry })).uploaded).toBe(0);
        expect(await env.SNAPSHOT.get("cam/0.jpg")).toBeNull();
    });

    it("gives up after ten consecutive failures instead of grinding through the slice", async () => {
        // 36 cameras -> a 12-camera slice. The breaker should stop it at 10.
        await putCameras(Array.from({ length: 36 }, (_, i) => camera(i)));
        stubFrames(() => new Error("522"));

        await mirrorCameras(env, { now: () => 0, retry });

        expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(10);
    });

    it("resets the failure count after a success, so scattered failures do not trip it", async () => {
        await putCameras(Array.from({ length: 36 }, (_, i) => camera(i)));
        let n = 0;
        stubFrames(() => (n++ % 2 === 0
            ? new Response(JPEG, { headers: { "content-type": "image/jpeg" } })
            : new Error("flaky")));

        const result = await mirrorCameras(env, { now: () => 0, retry });

        expect(result.attempted).toBe(12);
        expect(result.uploaded).toBeGreaterThan(1);
    });

    it("refreshes captured_at only for the cameras it actually mirrored", async () => {
        await putCameras([camera(0), camera(1), camera(2)]);
        stubFrames();

        await mirrorCameras(env, { now: () => NOW, retry });

        const items = JSON.parse(await (await env.SNAPSHOT.get(SNAPSHOT_KEYS.cameras))!.text()).items;
        const mirrored = items.filter((c: CameraEntry) => c.captured_at !== null);
        expect(mirrored).toHaveLength(1);
        expect(mirrored[0].captured_at).toBe(new Date(NOW).toISOString());
        // Untouched cameras keep whatever the metadata refresh last published.
        expect(items.filter((c: CameraEntry) => c.captured_at === null)).toHaveLength(2);
    });

    it("leaves cameras.json alone when nothing uploaded", async () => {
        await putCameras([camera(0)]);
        const before = await (await env.SNAPSHOT.get(SNAPSHOT_KEYS.cameras))!.text();
        stubFrames(() => new Error("522"));

        await mirrorCameras(env, { now: () => 0, retry });

        expect(await (await env.SNAPSHOT.get(SNAPSHOT_KEYS.cameras))!.text()).toBe(before);
    });

    it("does nothing when no camera metadata has been published yet", async () => {
        stubFrames();
        expect(await mirrorCameras(env, { now: () => 0, retry })).toMatchObject({ attempted: 0, uploaded: 0 });
    });
});
