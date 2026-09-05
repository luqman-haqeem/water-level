/** URL of a mirrored CCTV frame on the snapshot host (key: cam/{jpsCameraId}.jpg). */
export function cameraImageUrl(baseUrl: string, jpsCameraId: string, capturedAt?: string | null): string {
    const base = baseUrl.replace(/\/+$/, "");
    const version = capturedAt ? `?v=${encodeURIComponent(capturedAt)}` : "";
    return `${base}/cam/${jpsCameraId}.jpg${version}`;
}
