import { CAMERA_STATION_LINKS } from "./cameraLinks";
import type { CameraEntry } from "./cameraSync";

/**
 * The camera attached to a station in `stations.json`.
 *
 * Shape is the frontend's contract, inherited from the Convex query: `StationCard`
 * shows a badge when it is present, `/stations/$id` offers a "has a camera" filter over
 * it, and the detail page renders the frame only when `is_enabled` is true.
 */
export interface StationCamera {
    jps_camera_id: string;
    img_url: string;
    is_enabled: boolean;
    captured_at: string | null;
}

/**
 * Indexes cameras by the station they watch.
 *
 * The link is static (`cameraLinks.ts`) because JPS publishes nothing connecting the
 * two; the roster supplies the rest, so `captured_at` stays whatever the mirror last
 * wrote rather than being invented here.
 *
 * `is_enabled` is always true: the roster excludes cameras JPS marks disabled, so a
 * camera present here is by definition enabled. The field is kept because the detail
 * page branches on it.
 */
export function indexCamerasByStation(cameras: CameraEntry[]): Record<string, StationCamera> {
    const out: Record<string, StationCamera> = {};
    for (const camera of cameras) {
        const stationId = camera.station_id ?? CAMERA_STATION_LINKS[camera.jps_camera_id];
        if (!stationId) continue;
        out[stationId] = {
            jps_camera_id: camera.jps_camera_id,
            img_url: typeof camera.img_url === "string" ? camera.img_url : "",
            is_enabled: true,
            captured_at: camera.captured_at,
        };
    }
    return out;
}
