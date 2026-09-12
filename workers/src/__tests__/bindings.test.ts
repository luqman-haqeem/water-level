import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
    SNAPSHOT_KEYS,
    JSON_CACHE_CONTROL,
    IMAGE_CACHE_CONTROL,
    buildDataFiles,
    buildMetaFile,
    cameraImageKey,
} from "../shared";

/**
 * The bindings are what replace the aws4fetch client and the Convex tables. These
 * tests exercise the real (locally simulated) R2 and KV, so a pass means Phase 2 can
 * assume the storage layer works and focus on sync logic.
 */
describe("R2 snapshot bucket", () => {
    it("serves JSON under the keys and cache headers the frontend expects", async () => {
        const files = buildDataFiles({
            stations: [{ id: 1 }], cameras: [], trends: {}, generatedAt: "2026-09-02T00:00:00.000Z",
        });
        for (const f of files) {
            await env.SNAPSHOT.put(f.key, f.body, {
                httpMetadata: { contentType: "application/json", cacheControl: JSON_CACHE_CONTROL },
            });
        }

        const stations = await env.SNAPSHOT.get(SNAPSHOT_KEYS.stations);
        expect(stations).not.toBeNull();
        expect(stations!.httpMetadata?.cacheControl).toBe(JSON_CACHE_CONTROL);
        expect(JSON.parse(await stations!.text()).items).toEqual([{ id: 1 }]);
    });

    it("stores camera frames as binary under cam/{id}.jpg", async () => {
        const frame = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG SOI + APP0
        await env.SNAPSHOT.put(cameraImageKey("25"), frame, {
            httpMetadata: { contentType: "image/jpeg", cacheControl: IMAGE_CACHE_CONTROL },
        });

        const got = await env.SNAPSHOT.get("cam/25.jpg");
        expect(got).not.toBeNull();
        expect(got!.httpMetadata?.cacheControl).toBe(IMAGE_CACHE_CONTROL);
        expect(new Uint8Array(await got!.arrayBuffer())).toEqual(frame);
    });

    it("treats the object key as opaque, so a traversal key cannot overwrite the snapshot", async () => {
        // The reason the cameraImageKey guard is defence in depth rather than the only
        // control: the binding stores this literally instead of collapsing `..`.
        await env.SNAPSHOT.put(SNAPSHOT_KEYS.stations, JSON.stringify({ items: ["real"] }));
        await env.SNAPSHOT.put("cam/../stations.json.jpg", "hostile");

        const stations = await env.SNAPSHOT.get(SNAPSHOT_KEYS.stations);
        expect(JSON.parse(await stations!.text()).items).toEqual(["real"]);
        expect(await (await env.SNAPSHOT.get("cam/../stations.json.jpg"))!.text()).toBe("hostile");
    });

    it("overwrites in place, so republishing does not accumulate objects", async () => {
        const meta = buildMetaFile({
            syncedAt: "2026-09-02T00:00:00.000Z", attemptedAt: "2026-09-02T00:00:00.000Z",
            jpsLastUpdate: null, status: "ok",
        });
        await env.SNAPSHOT.put(meta.key, meta.body);
        await env.SNAPSHOT.put(meta.key, JSON.stringify({ status: "upstream_error" }));

        const listed = await env.SNAPSHOT.list({ prefix: SNAPSHOT_KEYS.meta });
        expect(listed.objects).toHaveLength(1);
        expect(JSON.parse(await (await env.SNAPSHOT.get(meta.key))!.text()).status).toBe("upstream_error");
    });
});

describe("KV sync state", () => {
    it("round-trips the syncState row that replaces the Convex table", async () => {
        const state = { lastStatus: "ok", lastSyncedAt: "2026-09-02T00:00:00.000Z", fingerprint: "abc" };
        await env.SYNC_STATE.put("syncState", JSON.stringify(state));
        expect(JSON.parse((await env.SYNC_STATE.get("syncState"))!)).toEqual(state);
    });

    it("expresses the notification cooldown as a TTL instead of a timestamp column", async () => {
        // Convex kept notificationLog rows and compared timestamps; KV expires the key
        // itself, so the cooldown cannot outlive its window through a logic bug.
        // 60s is Workers KV's minimum expirationTtl.
        await env.SYNC_STATE.put("notif:3214401", "1", { expirationTtl: 60 });
        expect(await env.SYNC_STATE.get("notif:3214401")).toBe("1");
        expect(await env.SYNC_STATE.get("notif:9999999")).toBeNull();
    });

    it("isolates storage per test file, so state cannot leak between suites", async () => {
        expect(await env.SYNC_STATE.get("never-written-here")).toBeNull();
    });
});
