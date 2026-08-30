// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
    buildDataFiles,
    buildMetaFile,
    cameraImageKey,
    metaFromSyncState,
    SNAPSHOT_KEYS,
} from "../snapshotBuilder";

describe("buildDataFiles", () => {
    it("emits trends, cameras, stations in that order with a generatedAt envelope", () => {
        const files = buildDataFiles({
            stations: [{ id: "s1" }],
            cameras: [{ id: "c1" }],
            trends: { s1: [{ timestamp: 1 }] },
            generatedAt: "2026-08-29T08:00:00.000Z",
        });
        expect(files.map((f) => f.key)).toEqual([
            SNAPSHOT_KEYS.trends,
            SNAPSHOT_KEYS.cameras,
            SNAPSHOT_KEYS.stations,
        ]);
        expect(JSON.parse(files[2].body)).toEqual({
            generatedAt: "2026-08-29T08:00:00.000Z",
            items: [{ id: "s1" }],
        });
        expect(JSON.parse(files[0].body).items).toEqual({ s1: [{ timestamp: 1 }] });
    });
});

describe("buildMetaFile", () => {
    it("serialises meta and omits undefined optional fields", () => {
        const file = buildMetaFile({
            syncedAt: "2026-08-29T08:00:00.000Z",
            attemptedAt: "2026-08-29T08:05:00.000Z",
            jpsLastUpdate: "2026-08-29T07:45:00.000Z",
            status: "ok",
        });
        expect(file.key).toBe("meta.json");
        expect(JSON.parse(file.body)).toEqual({
            syncedAt: "2026-08-29T08:00:00.000Z",
            attemptedAt: "2026-08-29T08:05:00.000Z",
            jpsLastUpdate: "2026-08-29T07:45:00.000Z",
            status: "ok",
        });
    });
});

describe("metaFromSyncState", () => {
    it("maps a sync-state row to meta", () => {
        expect(
            metaFromSyncState(
                {
                    lastSyncedAt: "A",
                    lastAttemptAt: "B",
                    lastJpsUpdate: "C",
                    lastStatus: "upstream_error",
                    failingSince: "D",
                    lastError: "HTTP 503",
                },
                "ignored"
            )
        ).toEqual({
            syncedAt: "A",
            attemptedAt: "B",
            jpsLastUpdate: "C",
            status: "upstream_error",
            failingSince: "D",
            error: "HTTP 503",
        });
    });

    it("produces an upstream_error meta when no row exists yet", () => {
        expect(metaFromSyncState(null, "2026-08-29T08:05:00.000Z")).toEqual({
            syncedAt: null,
            attemptedAt: "2026-08-29T08:05:00.000Z",
            jpsLastUpdate: null,
            status: "upstream_error",
            error: "No sync has completed yet",
        });
    });
});

describe("cameraImageKey", () => {
    it("builds cam/{id}.jpg", () => {
        expect(cameraImageKey("42")).toBe("cam/42.jpg");
    });
});
