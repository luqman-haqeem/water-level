import { isStale } from "@/utils/timeUtils";

/** URL of a mirrored CCTV frame on the snapshot host (key: cam/{jpsCameraId}.jpg). */
export function cameraImageUrl(baseUrl: string, jpsCameraId: string, capturedAt?: string | null): string {
    const base = baseUrl.replace(/\/+$/, "");
    const version = capturedAt ? `?v=${encodeURIComponent(capturedAt)}` : "";
    return `${base}/cam/${jpsCameraId}.jpg${version}`;
}

/** Shown when a camera has neither a fresh mirror nor a live upstream frame. */
export const NO_FRAME_IMAGE = "/nocctv.png";

/**
 * Live CCTV frames, straight from JPS.
 *
 * Built from `jps_camera_id` against a constant HTTPS base rather than from the
 * published `img_url`. Two reasons: every stored value is `http://`, which an HTTPS
 * page blocks as mixed content, and keeping an upstream-controlled string out of an
 * element `src` is the same precaution `cameraImageKey` documents on the write side —
 * JPS is not attacker-controlled today, but a malformed upstream should not be able to
 * steer where the browser fetches from.
 *
 * No cache-buster: JPS serves `ETag` and `Last-Modified` but no `Cache-Control`, so the
 * browser revalidates and a buster would only defeat the 304s, re-downloading 74-328 KB
 * every time. Leaving the URL deterministic also keeps it usable as a camera identity
 * key, which `routes/cameras` relies on to track the fullscreen image.
 */
const JPS_FRAME_BASE = "https://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image";
const JPS_CAMERA_ID = /^[0-9]{1,10}$/;

export interface CameraFrameSource {
    jps_camera_id: string;
    captured_at?: string | null;
    img_url?: string | null;
}

export function liveFrameUrl(camera: CameraFrameSource): string | null {
    // One roster entry (camera 247) publishes an empty img_url and has no live frame.
    if (!camera.img_url) return null;
    if (!JPS_CAMERA_ID.test(camera.jps_camera_id)) return null;
    return `${JPS_FRAME_BASE}/${camera.jps_camera_id}.jpg`;
}

/**
 * Where to fetch this camera's frame from.
 *
 * A CCTV image is the one thing users read as "what it looks like right now", so a
 * stale frame is worse than a slow one — a two-hour-old shot of a calm river during a
 * flood misleads in a way a stale number does not. When the mirror stops advancing we
 * therefore go to JPS directly rather than serving the last mirrored copy.
 *
 * `captured_at` is the right signal: it records when the frame was mirrored, so it
 * stops advancing exactly when `wl-cameras` does and reports the frame's true age.
 *
 * Upstream is slow — about half of JPS connections stall ~20 s at TCP connect — but
 * this path is only reached while the mirror is down, never in normal operation.
 */
export function cameraFrameUrl(baseUrl: string, camera: CameraFrameSource): string {
    if (!isStale(camera.captured_at ?? undefined)) {
        return cameraImageUrl(baseUrl, camera.jps_camera_id, camera.captured_at);
    }
    return liveFrameUrl(camera) ?? NO_FRAME_IMAGE;
}
