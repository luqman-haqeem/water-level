import {
    JSON_CACHE_CONTROL,
    SNAPSHOT_KEYS,
    buildMetaFile,
    metaFromSyncState,
    type SnapshotFile,
} from "./shared";
import type { SyncStateRow } from "./syncState";
import type { SnapshotStation } from "./stationMapper";
import type { Trends } from "./trends";

async function putJson(bucket: R2Bucket, file: SnapshotFile): Promise<void> {
    await bucket.put(file.key, file.body, {
        httpMetadata: { contentType: "application/json", cacheControl: JSON_CACHE_CONTROL },
    });
}

function envelope(generatedAt: string, items: unknown): string {
    return JSON.stringify({ generatedAt, items });
}

/**
 * Publishes the snapshot.
 *
 * Two orderings matter and are load-bearing:
 *
 * 1. **`meta.json` is written last.** It is what the frontend trusts to decide how
 *    fresh the data is, so it must never describe data that has not been published.
 *    A crash midway leaves meta pointing at the previous, complete snapshot.
 * 2. **`cameras.json` is not written here.** The camera mirror owns it (Phase 3/4).
 *    Writing an empty one from this Worker would blank every camera in the app.
 */
export async function publishSnapshot(
    bucket: R2Bucket,
    input: {
        stations: SnapshotStation[];
        trends: Trends;
        state: SyncStateRow | null;
        attemptedAt: string;
        generatedAt: string;
    }
): Promise<void> {
    await putJson(bucket, { key: SNAPSHOT_KEYS.trends, body: envelope(input.generatedAt, input.trends) });
    await putJson(bucket, { key: SNAPSHOT_KEYS.stations, body: envelope(input.generatedAt, input.stations) });
    await publishMeta(bucket, input.state, input.attemptedAt);
}

/**
 * Publishes only `meta.json`. Used by the paths that have no new data to write —
 * an upstream failure or an unchanged run — so the UI still learns that we tried
 * and when.
 */
export async function publishMeta(
    bucket: R2Bucket,
    state: SyncStateRow | null,
    attemptedAt: string
): Promise<void> {
    await putJson(bucket, buildMetaFile(metaFromSyncState(state, attemptedAt)));
}
