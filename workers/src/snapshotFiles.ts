import { SNAPSHOT_KEYS } from "./shared";

/**
 * The slice of R2 the read path actually uses, expressed structurally.
 *
 * `R2Bucket` satisfies this, but naming it here instead means the readers below carry
 * no Cloudflare ambient types — which is what lets the Convex standby publisher import
 * them and supply its own reader over the S3 API. Widening this interface re-couples
 * those modules to workerd, so keep it to what a plain object store can offer.
 */
export interface SnapshotReader {
    get(key: string): Promise<{ text(): Promise<string> } | null>;
}

/** A camera as published in `cameras.json`. */
export interface CameraEntry {
    id: string;
    jps_camera_id: string;
    captured_at: string | null;
    /** JPS id of the station this camera watches, when known. See cameraLinks.ts. */
    station_id?: string | null;
    [key: string]: unknown;
}

/**
 * Reads the published camera roster.
 *
 * A missing or unparseable object yields an empty roster rather than throwing: the
 * roster only decorates stations with their camera, so losing it degrades the badge
 * and the camera filter, while failing the run would cost the readings themselves.
 */
export async function readCameras(reader: SnapshotReader): Promise<CameraEntry[]> {
    const object = await reader.get(SNAPSHOT_KEYS.cameras);
    if (!object) return [];
    try {
        const parsed = JSON.parse(await object.text()) as { items?: CameraEntry[] };
        return parsed.items ?? [];
    } catch (error) {
        console.warn(`cameras.json unreadable, nothing to mirror: ${error}`);
        return [];
    }
}
