import { JSON_CACHE_CONTROL, SNAPSHOT_KEYS, fetchWithRetry } from "./shared";
import { CAMERA_STATION_LINKS } from "./cameraLinks";
import { readCameras, type CameraEntry } from "./cameraSync";
import type { JpsDistrictSummary, RetryOverrides } from "./jps";

const CCTV_IMAGE_BASE = "https://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image";

interface JpsCamera {
    id: number;
    cameraName?: string;
    imageUrl?: string;
    isEnabled?: boolean;
}

/**
 * Refreshes camera metadata from JPS.
 *
 * Weekly, because names and the roster change rarely while the frames change
 * constantly — that split is why the mirror and this are separate jobs.
 */
export async function fetchCameras(
    baseUrl: string,
    districts: JpsDistrictSummary[],
    retry: RetryOverrides = {}
): Promise<{ cameras: CameraEntry[]; failedDistricts: number }> {
    const byId = new Map<string, CameraEntry>();
    let failedDistricts = 0;

    const results = await Promise.all(
        districts.map(async (d) => {
            try {
                const res = await fetchWithRetry(`${baseUrl}/CCTVS/GetCCTVsByDistrict/${d.districtId}`, {
                    timeoutMs: 20_000,
                    retries: 1,
                    backoffMs: 5_000,
                    ...retry,
                });
                const parsed: unknown = await res.json();
                if (!Array.isArray(parsed)) throw new Error("camera response is not an array");
                return { district: d, cameras: parsed as JpsCamera[] };
            } catch (error) {
                console.warn(`Failed to fetch cameras for district ${d.district}: ${error}`);
                return { district: d, cameras: null };
            }
        })
    );

    for (const { district, cameras } of results) {
        if (cameras === null) {
            failedDistricts += 1;
            continue;
        }
        for (const c of cameras) {
            if (c.isEnabled === false) continue;
            const id = String(c.id);
            byId.set(id, {
                id,
                jps_camera_id: id,
                camera_name: c.cameraName || `Camera ${id}`,
                img_url: c.imageUrl || `${CCTV_IMAGE_BASE}/${id}.jpg`,
                districts: { name: district.district },
                // New in the snapshot. The mirror needs it to prioritise cameras whose
                // river is rising, and JPS publishes no such link — see cameraLinks.ts.
                station_id: CAMERA_STATION_LINKS[id] ?? null,
                captured_at: null,
            });
        }
    }

    return {
        cameras: [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id)),
        failedDistricts,
    };
}

/**
 * Publishes the refreshed roster, preserving each camera's `captured_at`.
 *
 * That timestamp belongs to the mirror, not to this job. Overwriting it with null
 * would tell the UI every frame is of unknown age until the rotation came round again.
 */
export async function publishCameras(bucket: R2Bucket, cameras: CameraEntry[], generatedAt: string): Promise<void> {
    const existing = new Map((await readCameras(bucket)).map((c) => [c.id, c.captured_at]));
    const merged = cameras.map((c) => ({ ...c, captured_at: existing.get(c.id) ?? null }));

    await bucket.put(SNAPSHOT_KEYS.cameras, JSON.stringify({ generatedAt, items: merged }), {
        httpMetadata: { contentType: "application/json", cacheControl: JSON_CACHE_CONTROL },
    });
}
