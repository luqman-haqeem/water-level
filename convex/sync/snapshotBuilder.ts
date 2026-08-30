export const SNAPSHOT_KEYS = {
    stations: "stations.json",
    cameras: "cameras.json",
    trends: "trends.json",
    meta: "meta.json",
} as const;

export const JSON_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";
export const IMAGE_CACHE_CONTROL = "public, max-age=300";

export function cameraImageKey(jpsCameraId: string): string {
    return `cam/${jpsCameraId}.jpg`;
}

export type SyncStatus = "ok" | "upstream_error";

export interface SnapshotMeta {
    syncedAt: string | null;
    attemptedAt: string;
    jpsLastUpdate: string | null;
    status: SyncStatus;
    failingSince?: string;
    error?: string;
}

export interface SnapshotEnvelope<T> {
    generatedAt: string;
    items: T;
}

export interface SnapshotFile {
    key: string;
    body: string;
}

export interface SyncStateLike {
    lastSyncedAt?: string;
    lastAttemptAt: string;
    lastJpsUpdate?: string;
    lastStatus: SyncStatus;
    failingSince?: string;
    lastError?: string;
}

function envelope<T>(generatedAt: string, items: T): string {
    const body: SnapshotEnvelope<T> = { generatedAt, items };
    return JSON.stringify(body);
}

/** Data files in upload order: trends, cameras, stations (meta is uploaded last, separately). */
export function buildDataFiles(input: {
    stations: unknown[];
    cameras: unknown[];
    trends: Record<string, unknown[]>;
    generatedAt: string;
}): SnapshotFile[] {
    return [
        { key: SNAPSHOT_KEYS.trends, body: envelope(input.generatedAt, input.trends) },
        { key: SNAPSHOT_KEYS.cameras, body: envelope(input.generatedAt, input.cameras) },
        { key: SNAPSHOT_KEYS.stations, body: envelope(input.generatedAt, input.stations) },
    ];
}

export function buildMetaFile(meta: SnapshotMeta): SnapshotFile {
    return { key: SNAPSHOT_KEYS.meta, body: JSON.stringify(meta) };
}

export function metaFromSyncState(row: SyncStateLike | null, attemptedAt: string): SnapshotMeta {
    if (!row) {
        return {
            syncedAt: null,
            attemptedAt,
            jpsLastUpdate: null,
            status: "upstream_error",
            error: "No sync has completed yet",
        };
    }
    return {
        syncedAt: row.lastSyncedAt ?? null,
        attemptedAt: row.lastAttemptAt,
        jpsLastUpdate: row.lastJpsUpdate ?? null,
        status: row.lastStatus,
        failingSince: row.failingSince,
        error: row.lastError,
    };
}
