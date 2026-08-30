// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { fetchWithRetry } from "../fetchWithRetry";

const ok = () => new Response("ok", { status: 200 });
const noSleep = async () => {};

describe("fetchWithRetry", () => {
    it("returns the first successful response", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(ok());
        const res = await fetchWithRetry("https://x.test/a", { fetchImpl, sleep: noSleep });
        expect(res.status).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("retries once after a non-ok response, then succeeds", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(new Response("busy", { status: 503 }))
            .mockResolvedValueOnce(ok());
        const sleep = vi.fn().mockResolvedValue(undefined);
        const res = await fetchWithRetry("https://x.test/a", { fetchImpl, sleep, retries: 1, backoffMs: 5000 });
        expect(res.status).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledWith(5000);
    });

    it("throws the last error after exhausting retries", async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
        await expect(
            fetchWithRetry("https://x.test/a", { fetchImpl, sleep: noSleep, retries: 2 })
        ).rejects.toThrow("ECONNRESET");
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it("aborts a hung request after timeoutMs", async () => {
        vi.useFakeTimers();
        const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
            new Promise<Response>((_, reject) => {
                init?.signal?.addEventListener("abort", () =>
                    reject(new DOMException("aborted", "AbortError"))
                );
            })
        );
        const pending = fetchWithRetry("https://x.test/slow", {
            fetchImpl: fetchImpl as unknown as typeof fetch,
            sleep: noSleep,
            timeoutMs: 100,
            retries: 0,
        });
        const assertion = expect(pending).rejects.toThrow("aborted");
        await vi.advanceTimersByTimeAsync(100);
        await assertion;
        vi.useRealTimers();
    });
});
