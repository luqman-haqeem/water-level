import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.test");

import { useSnapshot, resetSnapshotStoresForTests, refreshSnapshots } from "@/hooks/useSnapshot";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { etag: '"x"' } });

describe("useSnapshot", () => {
    beforeEach(() => {
        resetSnapshotStoresForTests();
        localStorage.clear();
    });
    afterEach(() => vi.unstubAllGlobals());

    it("loads a file once for many subscribers and re-renders with data", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json({ generatedAt: "t", items: [{ id: "a" }] }));
        vi.stubGlobal("fetch", fetchMock);

        const first = renderHook(() => useSnapshot<{ items: { id: string }[] }>("stations"));
        const second = renderHook(() => useSnapshot<{ items: { id: string }[] }>("stations"));

        await waitFor(() => expect(first.result.current.data?.items).toEqual([{ id: "a" }]));
        expect(second.result.current.data?.items).toEqual([{ id: "a" }]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("refreshes when the tab becomes visible", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json({ items: [] }));
        vi.stubGlobal("fetch", fetchMock);
        renderHook(() => useSnapshot("meta"));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        await act(async () => {
            Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
            document.dispatchEvent(new Event("visibilitychange"));
        });
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });

    it("refreshSnapshots() refetches every started store", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json({ items: [] }));
        vi.stubGlobal("fetch", fetchMock);
        renderHook(() => useSnapshot("stations"));
        renderHook(() => useSnapshot("cameras"));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        await act(() => refreshSnapshots());
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("registers visibility listeners once per store, not per subscriber", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json({ items: [] }));
        vi.stubGlobal("fetch", fetchMock);
        renderHook(() => useSnapshot("trends"));
        renderHook(() => useSnapshot("trends"));
        renderHook(() => useSnapshot("trends"));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        await act(async () => {
            Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
            document.dispatchEvent(new Event("visibilitychange"));
        });
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
