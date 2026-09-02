import type { Config, Context } from "https://edge.netlify.com/v1/mod.ts";
import { ImageResponse } from "https://deno.land/x/og_edge/mod.ts";
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

/** Shape returned by the Convex `stations:getStationDetailById` query. */
interface StationDetail {
    station_name: string;
    districts: { name: string };
    current_levels: {
        current_level: number;
        updated_at?: string;
        alert_level: string;
    } | null;
    cameras: {
        img_url?: string;
        jps_camera_id: string;
        is_enabled: boolean;
    } | null;
    station_status: boolean;
}

/**
 * Fetches the authoritative station record from Convex.
 *
 * SECURITY: every value rendered into this card must come from here, never from
 * the query string. This endpoint previously read `name`, `district`, `level`,
 * `alert`, `updated`, `online` and `camera` straight off the URL, so anyone
 * could mint an authentic-looking red "DANGER 99.90m" card on our own domain for
 * a real station (or a reassuring "NORMAL" one during an actual flood) and share
 * it. For a public flood-warning app that is a misinformation vector, so the
 * spoofable parameters are gone entirely.
 *
 * The previous implementation also queried a function that does not exist
 * (`waterLevelData:getCurrentLevelByStationId`) and did not unwrap Convex's
 * `{ status, value }` response envelope, so the live-data path never worked and
 * every request silently fell through to the spoofable parameters.
 */
async function getStationDetail(
    stationId: string
): Promise<StationDetail | null> {
    const convexUrl =
        Deno.env.get("CONVEX_URL") ?? Deno.env.get("VITE_CONVEX_URL");

    if (!convexUrl) {
        console.error("CONVEX_URL / VITE_CONVEX_URL is not configured");
        return null;
    }

    try {
        const response = await fetch(`${convexUrl}/api/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                path: "stations:getStationDetailById",
                args: { stationId },
            }),
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            console.error(`Convex query failed: HTTP ${response.status}`);
            return null;
        }

        // Convex wraps results as { status: "success", value } or
        // { status: "error", errorMessage }. An invalid/forged stationId lands
        // in the error branch rather than throwing.
        const result = await response.json();
        if (result?.status !== "success" || !result.value) {
            return null;
        }

        return result.value as StationDetail;
    } catch (error) {
        console.error("Failed to fetch station detail:", error);
        return null;
    }
}

/** JPS camera ids are bare integers — mirrors the check in the image proxy. */
const CAMERA_ID_PATTERN = /^[0-9]{1,10}$/;

/**
 * Adds caching to a rendered card.
 *
 * Each request costs a Convex query, a camera-image fetch and a satori render,
 * so an uncached endpoint is a cheap amplification target. 5 minutes matches the
 * proxy-image cache and is well inside the 15-minute sync interval.
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
    const station = await getStationDetail(stationId);

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
    // (e.g. `?camera=http://169.254.169.254/latest/meta-data/`). We now build it
    // from the database's own camera id and route it through our own hardened
    // proxy, with the same numeric validation the proxy applies.
    const jpsCameraId = station.cameras?.jps_camera_id;
    const cameraUrl =
        station.cameras?.is_enabled &&
        jpsCameraId &&
        CAMERA_ID_PATTERN.test(jpsCameraId)
            ? `${new URL(request.url).origin}/api/proxy-image/${jpsCameraId}`
            : null;
    const hasCameraImage = cameraUrl !== null;

    const alertInfo = getAlertInfo(alertLevel, isOnline);
    const lastUpdated = formatDateTime(updatedAt);

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