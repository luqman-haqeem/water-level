import { describe, it, expect, vi } from "vitest";
import { JPS_BASE_URL, fetchJpsJson } from "../lib/jpsClient";

/**
 * The TLS incompatibility that motivated `jpsClient` (JPS only negotiates the
 * CBC suite ECDHE-RSA-AES256-SHA384, which rustls in Convex's default runtime
 * refuses) cannot be reproduced under Vitest — it is verified by running the
 * sync against a real deployment. What is pinned here is the behaviour the
 * Node-runtime action relies on: a fixed upstream host, per-attempt timeouts,
 * and retrying the connection drops JPS now produces intermittently.
 */

const ok = (body: unknown) =>
    new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
    });

const fast = { backoffMs: 0 };

describe("fetchJpsJson", () => {
    it("fetches the path under the JPS API base and parses JSON", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(ok([{ districtId: 1 }]));

        const data = await fetchJpsJson(
            "/StationRiverLevels/GetWLStationSummary",
            { fetchImpl, ...fast }
        );

        expect(data).toEqual([{ districtId: 1 }]);
        expect(fetchImpl).toHaveBeenCalledWith(
            `${JPS_BASE_URL}/StationRiverLevels/GetWLStationSummary`,
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
    });

    it("retries a dropped connection and returns the later success", async () => {
        const fetchImpl = vi
            .fn()
            .mockRejectedValueOnce(new TypeError("fetch failed"))
            .mockResolvedValueOnce(ok({ stations: [] }));

        const data = await fetchJpsJson("/StationRiverLevels/GetWLAllStationData/1", {
            fetchImpl,
            ...fast,
        });

        expect(data).toEqual({ stations: [] });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("retries 5xx responses", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(new Response("busy", { status: 503 }))
            .mockResolvedValueOnce(ok([]));

        await expect(
            fetchJpsJson("/CCTVS/GetCCTVsByDistrict/1", { fetchImpl, ...fast })
        ).resolves.toEqual([]);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("does not retry 4xx responses", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 404 }));

        await expect(
            fetchJpsJson("/CCTVS/GetCCTVsByDistrict/99", { fetchImpl, ...fast })
        ).rejects.toThrow(/HTTP 404/);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("gives up after the configured attempts and reports the last error", async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new TypeError("tls handshake eof"));

        await expect(
            fetchJpsJson("/StationRiverLevels/GetWLStationSummary", {
                fetchImpl,
                attempts: 3,
                ...fast,
            })
        ).rejects.toThrow(/after 3 attempts.*tls handshake eof/);
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it("rejects paths that could escape the JPS API host", async () => {
        const fetchImpl = vi.fn();

        for (const path of [
            "https://evil.example/x",
            "//evil.example/x",
            "StationRiverLevels/GetWLStationSummary",
            "/../../admin",
            "/x?y=1",
        ]) {
            await expect(fetchJpsJson(path, { fetchImpl, ...fast })).rejects.toThrow(
                /Invalid JPS path/
            );
        }
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
