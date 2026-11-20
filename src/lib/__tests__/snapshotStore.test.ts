import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSnapshotStore } from "@/lib/snapshotStore";

function memoryStorage() {
    const map = new Map<string, string>();
    return {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
        map,
    };
}

const json = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json", ...(init.headers ?? {}) },
        ...init,
    });

describe("createSnapshotStore", () => {
    beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
    afterEach(() => vi.useRealTimers());

    it("fetches on start, exposes data, persists to storage, notifies subscribers", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(json({ generatedAt: "t1", items: [1] }, { headers: { etag: '"e1"' } }));
        const storage = memoryStorage();
        const store = createSnapshotStore<{ items: number[] }>({
            baseUrl: "https://cdn.test", file: "stations", fetchImpl, storage, pollMs: 120_000,
        });
        const listener = vi.fn();
        store.subscribe(listener);

        expect(store.getState().isLoading).toBe(true);
        store.start();
        await vi.advanceTimersByTimeAsync(0);

        expect(fetchImpl).toHaveBeenCalledWith("https://cdn.test/stations.json", expect.objectContaining({ headers: {} }));
        expect(store.getState()).toMatchObject({ data: { items: [1] }, isLoading: false, error: null, fromCache: false });
        expect(listener).toHaveBeenCalled();
        expect(JSON.parse(storage.map.get("snapshot:stations")!)).toMatchObject({ data: { items: [1] }, etag: '"e1"' });
        store.stop();
    });

    it("sends If-None-Match on the next poll and keeps data on 304", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(json({ items: [1] }, { headers: { etag: '"e1"' } }))
            .mockResolvedValueOnce(new Response(null, { status: 304 }));
        const store = createSnapshotStore<{ items: number[] }>({
            baseUrl: "https://cdn.test", file: "meta", fetchImpl, storage: null, pollMs: 120_000,
        });
        store.start();
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(120_000);

        expect(fetchImpl).toHaveBeenLastCalledWith("https://cdn.test/meta.json", expect.objectContaining({ headers: { "If-None-Match": '"e1"' } }));
        expect(store.getState().data).toEqual({ items: [1] });
        expect(store.getState().error).toBeNull();
        store.stop();
    });

    it("does not notify subscribers on a no-op 304", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(json({ items: [1] }, { headers: { etag: '"e1"' } }))
            .mockResolvedValueOnce(new Response(null, { status: 304 }));
        const store = createSnapshotStore<{ items: number[] }>({
            baseUrl: "https://cdn.test", file: "meta", fetchImpl, storage: null, pollMs: 120_000,
        });
        const listener = vi.fn();
        store.subscribe(listener);
        store.start();
        await vi.advanceTimersByTimeAsync(0);

        const callsAfterFirstLoad = listener.mock.calls.length;
        const stateAfterFirstLoad = store.getState();

        await vi.advanceTimersByTimeAsync(120_000);

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(listener).toHaveBeenCalledTimes(callsAfterFirstLoad);
        expect(store.getState()).toBe(stateAfterFirstLoad);
        store.stop();
    });

    it("hydrates from storage before the network answers and flags fromCache", async () => {
        const storage = memoryStorage();
        storage.setItem("snapshot:cameras", JSON.stringify({ data: { items: ["cached"] }, etag: '"old"', fetchedAt: 5 }));
        const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
        const store = createSnapshotStore<{ items: string[] }>({
            baseUrl: "https://cdn.test", file: "cameras", fetchImpl, storage, pollMs: 120_000,
        });
        store.start();
        expect(store.getState()).toMatchObject({ data: { items: ["cached"] }, fromCache: true, isLoading: false, fetchedAt: 5 });
        store.stop();
    });

    it("keeps old data, sets error, and backs off exponentially on failures", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(json({ items: [1] }))
            .mockRejectedValue(new Error("network down"));
        const store = createSnapshotStore<{ items: number[] }>({
            baseUrl: "https://cdn.test", file: "trends", fetchImpl, storage: null, pollMs: 1_000, maxBackoffMs: 8_000,
        });
        store.start();
        await vi.advanceTimersByTimeAsync(0);          // ok
        await vi.advanceTimersByTimeAsync(1_000);      // fail #1 → next in 2s
        expect(store.getState()).toMatchObject({ data: { items: [1] }, error: expect.any(Error) });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1_000);
        expect(fetchImpl).toHaveBeenCalledTimes(2);    // not yet (backoff)
        await vi.advanceTimersByTimeAsync(1_000);
        expect(fetchImpl).toHaveBeenCalledTimes(3);    // fail #2 → next in 4s
        await vi.advanceTimersByTimeAsync(4_000);
        expect(fetchImpl).toHaveBeenCalledTimes(4);    // fail #3 → next in 8s (cap)
        await vi.advanceTimersByTimeAsync(8_000);
        expect(fetchImpl).toHaveBeenCalledTimes(5);
        store.stop();
    });

    it("treats a non-2xx response as an error", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 502 }));
        const store = createSnapshotStore({ baseUrl: "https://cdn.test", file: "meta", fetchImpl, storage: null });
        store.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().error?.message).toMatch(/502/);
        expect(store.getState().isLoading).toBe(false);
        store.stop();
    });

    it("refresh() is deduplicated while a request is in flight", async () => {
        let resolve!: (r: Response) => void;
        const fetchImpl = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
        const store = createSnapshotStore({ baseUrl: "https://cdn.test", file: "meta", fetchImpl, storage: null });
        store.start();
        void store.refresh();
        void store.refresh();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        resolve(json({ items: [] }));
        await vi.advanceTimersByTimeAsync(0);
        store.stop();
    });
});
