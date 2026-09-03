import type { Config, Context } from "https://edge.netlify.com/v1/mod.ts";
import { ImageResponse } from "https://deno.land/x/og_edge@0.0.6/mod.ts";
import React from "https://esm.sh/react@18.2.0";

// Styles for the Open Graph image
const STYLES = {
    wrapper: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column" as const,
        backgroundColor: "#ffffff",
        fontFamily: "system-ui, -apple-system, sans-serif",
    },

    // Centered layout (no camera)
    centeredWrapper: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        backgroundColor: "#ffffff",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "40px",
    },

    // Two-column layout (with camera)
    twoColumnWrapper: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "row" as const,
        backgroundColor: "#ffffff",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "40px",
    },

    leftColumn: {
        display: "flex",
        flexDirection: "column" as const,
        flex: 1,
        paddingRight: "40px",
    },

    rightColumn: {
        display: "flex",
        alignItems: "center" as const,
        justifyContent: "center" as const,
        width: "420px",
    },

    // Typography
    stationName: {
        fontSize: 56,
        fontWeight: 700,
        color: "#1F2937",
        marginBottom: "20px",
        textAlign: "center" as const,
    },

    stationNameLeft: {
        fontSize: 56,
        fontWeight: 700,
        color: "#1F2937",
        marginBottom: "20px",
    },

    district: {
        fontSize: 28,
        color: "#6B7280",
        marginBottom: "30px",
        textAlign: "center" as const,
    },

    districtLeft: {
        fontSize: 28,
        color: "#6B7280",
        marginBottom: "30px",
    },

    alertBadge: {
        padding: "15px 30px",
        borderRadius: "15px",
        fontSize: 28,
        fontWeight: 700,
        color: "#FFFFFF",
        marginBottom: "40px",
        textAlign: "center" as const,
        alignSelf: "center" as const,
        width: "200px",
    },

    alertBadgeLeft: {
        padding: "15px 30px",
        borderRadius: "15px",
        fontSize: 28,
        fontWeight: 700,
        color: "#FFFFFF",
        marginBottom: "30px",
        textAlign: "center" as const,
        width: "200px",
    },

    waterLevel: {
        fontSize: 140,
        fontWeight: 700,
        color: "#1F2937",
        marginBottom: "20px",
        textAlign: "center" as const,
    },

    waterLevelLeft: {
        fontSize: 80,
        fontWeight: 700,
        color: "#1F2937",
        marginBottom: "20px",
    },

    waterLevelLabel: {
        fontSize: 32,
        color: "#6B7280",
        marginBottom: "40px",
        textAlign: "center" as const,
    },

    waterLevelLabelLeft: {
        fontSize: 28,
        color: "#6B7280",
        marginBottom: "30px",
    },

    lastUpdated: {
        fontSize: 24,
        color: "#6B7280",
        marginBottom: "20px",
        textAlign: "center" as const,
    },

    lastUpdatedLeft: {
        fontSize: 22,
        color: "#6B7280",
        marginBottom: "20px",
    },

    status: {
        fontSize: 26,
        color: "#374151",
        display: "flex",
        alignItems: "center" as const,
        justifyContent: "center" as const,
        gap: "12px",
    },

    statusLeft: {
        fontSize: 24,
        color: "#374151",
        display: "flex",
        alignItems: "center" as const,
        gap: "12px",
    },

    statusDot: {
        width: "16px",
        height: "16px",
        borderRadius: "50%",
    },

    cameraImage: {
        width: "420px",
        height: "420px",
        borderRadius: "20px",
        objectFit: "cover" as const,
    },

    cameraPlaceholder: {
        width: "420px",
        height: "420px",
        borderRadius: "20px",
        backgroundColor: "#F3F4F6",
        display: "flex",
        alignItems: "center" as const,
        justifyContent: "center" as const,
        flexDirection: "column" as const,
    },

    cameraPlaceholderText: {
        fontSize: 24,
        color: "#9CA3AF",
        fontWeight: 700,
    },
};

// Alert level color mapping
const ALERT_COLORS = {
    "0": { bg: "#10B981", label: "NORMAL" },
    "1": { bg: "#F59E0B", label: "ALERT" },
    "2": { bg: "#EF4444", label: "WARNING" },
    "3": { bg: "#DC2626", label: "DANGER" },
    "offline": { bg: "#6B7280", label: "OFFLINE" },
};

function formatDateTime(dateString?: string) {
    if (!dateString) return "No recent data";

    try {
        const date = new Date(dateString);
        return date.toLocaleString("en-MY", {
            timeZone: "Asia/Kuala_Lumpur",
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "Invalid date";
    }
}

function getAlertInfo(alertLevel: string, isOnline: boolean) {
    if (!isOnline) return ALERT_COLORS.offline;
    return ALERT_COLORS[alertLevel as keyof typeof ALERT_COLORS] || ALERT_COLORS.offline;
}

interface SnapshotStationForOg {
    id: string;
    station_name: string;
    districts: { name: string };
    current_levels: { current_level: number; alert_level: string; updated_at?: string } | null;
    cameras: { jps_camera_id: string; is_enabled: boolean } | null;
    station_status: boolean;
}

const SNAPSHOT_BASE_URL = (Netlify.env.get("VITE_SNAPSHOT_BASE_URL") ?? "").replace(/\/+$/, "");

/**
 * Fetches the authoritative station record from the published R2 snapshot.
 *
 * SECURITY: every value rendered into this card must come from here, never from
 * the query string. This endpoint previously read `name`, `district`, `level`,
 * `alert`, `updated`, `online` and `camera` straight off the URL, so anyone
 * could mint an authentic-looking red "DANGER 99.90m" card on our own domain for
 * a real station (or a reassuring "NORMAL" one during an actual flood) and share
 * it. For a public flood-warning app that is a misinformation vector, so the
 * spoofable parameters are gone entirely. That property is preserved here — only
 * `stationId` comes from the request, and it is used solely as a lookup key.
 *
 * The read path is now one CDN-cached fetch of stations.json: no Convex, no JPS.
 * The previous implementation queried `stations:getStationDetailById` over the
 * Convex HTTP API, which is why this endpoint returned 502 in production.
 * Returns null if the snapshot is unreachable or the id is unknown.
 */
async function getStationFromSnapshot(stationId: string): Promise<SnapshotStationForOg | null> {
    if (!SNAPSHOT_BASE_URL) {
        console.error("VITE_SNAPSHOT_BASE_URL is not configured");
        return null;
    }
    try {
        const response = await fetch(`${SNAPSHOT_BASE_URL}/stations.json`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
            console.warn(`og-image: stations.json HTTP ${response.status}`);
            return null;
        }
        const body = (await response.json()) as { items: SnapshotStationForOg[] };
        return body.items.find((s) => s.id === stationId) ?? null;
    } catch (error) {
        console.warn("og-image: snapshot fetch failed", error);
        return null;
    }
}

/** JPS camera ids are bare integers — mirrors `cameraImageKey` in the publisher. */
const CAMERA_ID_PATTERN = /^[0-9]{1,10}$/;

/**
 * Adds caching to a rendered card.
 *
 * Each request costs a snapshot fetch, a camera-image fetch and a satori render,
 * so an uncached endpoint is a cheap amplification target. 5 minutes matches the
 * mirrored frames' Cache-Control and is well inside the 15-minute mirror interval.
 */
function withCacheHeaders(response: Response): Response {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, {
        status: response.status,
        headers,
    });
}

export default async (request: Request, context: Context) => {
    const { stationId } = context.params;

    if (!stationId) {
        return new Response("Station ID is required", { status: 400 });
    }

    // Single source of truth. No query parameter influences what is rendered.
    const station = await getStationFromSnapshot(stationId);

    if (!station) {
        return new Response("Station not found", { status: 404 });
    }

    const stationName = station.station_name;
    const district = station.districts.name;
    const currentLevel = station.current_levels?.current_level ?? 0;
    const updatedAt = station.current_levels?.updated_at;
    const isOnline = station.station_status;

    // A station with no reading is shown as offline rather than as "NORMAL",
    // so a missing reading can never render as an all-clear.
    const alertLevel = station.current_levels?.alert_level ?? "offline";

    // The camera image is rendered server-side by ImageResponse, so `src` is an
    // outbound fetch from this edge function. It must never be caller-supplied:
    // the previous `?camera=` parameter made this a straightforward SSRF sink
    // (e.g. `?camera=http://169.254.169.254/latest/meta-data/`). The id now comes
    // from the snapshot and addresses a mirrored frame on our own bucket, but the
    // numeric check is kept: the id is interpolated into a URL, and URL parsing
    // collapses `..`, so a hostile or malformed upstream id could otherwise walk
    // out of the `cam/` prefix. Same guard as `cameraImageKey` applies server-side.
    const jpsCameraId = station.cameras?.jps_camera_id;
    const cameraUrl =
        station.cameras?.is_enabled &&
        jpsCameraId &&
        CAMERA_ID_PATTERN.test(jpsCameraId)
            ? `${SNAPSHOT_BASE_URL}/cam/${jpsCameraId}.jpg`
            : null;
    const hasCameraImage = cameraUrl !== null;

    const alertInfo = getAlertInfo(alertLevel, isOnline);
    const lastUpdated = updatedAt ? formatDateTime(updatedAt) : "No recent reading";

    // Choose layout based on camera availability
    if (hasCameraImage) {
        // Two-column layout with camera
        return withCacheHeaders(new ImageResponse(
            (
                <div style={STYLES.twoColumnWrapper}>
                    <div style={STYLES.leftColumn}>
                        <div style={STYLES.stationNameLeft}>
                            {stationName.length > 25 ? stationName.substring(0, 22) + "..." : stationName}
                        </div>
                        <div style={STYLES.districtLeft}>{district} District</div>
                        <div style={{ ...STYLES.alertBadgeLeft, backgroundColor: alertInfo.bg }}>
                            {alertInfo.label}
                        </div>
                        <div style={STYLES.waterLevelLeft}>{currentLevel.toFixed(2)}m</div>
                        <div style={STYLES.waterLevelLabelLeft}>Current Water Level</div>
                        <div style={STYLES.lastUpdatedLeft}>Last Updated: {lastUpdated}</div>
                        <div style={STYLES.statusLeft}>
                            <div style={{ ...STYLES.statusDot, backgroundColor: isOnline ? "#10B981" : "#EF4444" }}></div>
                            Station {isOnline ? "Online" : "Offline"}
                        </div>
                    </div>
                    <div style={STYLES.rightColumn}>
                        <img src={cameraUrl!} alt="Live Camera" style={STYLES.cameraImage} />
                    </div>
                </div>
            ),
            { width: 1200, height: 630 }
        ));
    } else {
        // Centered layout without camera
        return withCacheHeaders(new ImageResponse(
            (
                <div style={STYLES.centeredWrapper}>
                    <div style={STYLES.stationName}>
                        {stationName.length > 25 ? stationName.substring(0, 22) + "..." : stationName}
                    </div>
                    <div style={STYLES.district}>{district} District</div>
                    <div style={{ ...STYLES.alertBadge, backgroundColor: alertInfo.bg }}>
                        {alertInfo.label}
                    </div>
                    <div style={STYLES.waterLevel}>{currentLevel.toFixed(2)}m</div>
                    <div style={STYLES.waterLevelLabel}>Current Water Level</div>
                    <div style={STYLES.lastUpdated}>Last Updated: {lastUpdated}</div>
                    <div style={STYLES.status}>
                        <div style={{ ...STYLES.statusDot, backgroundColor: isOnline ? "#10B981" : "#EF4444" }}></div>
                        Station {isOnline ? "Online" : "Offline"}
                    </div>
                </div>
            ),
            { width: 1200, height: 630 }
        ));
    }
};

export const config: Config = {
    path: "/og/station/:stationId"
};