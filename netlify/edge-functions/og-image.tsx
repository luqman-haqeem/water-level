import type { Config, Context } from "@netlify/edge-functions";
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

// Function to fetch station data
async function getStationData(stationId: string, origin: string) {
    try {
        // You'll need to replace this URL with your actual Convex HTTP endpoint
        const convexUrl = Deno.env.get("CONVEX_HTTP_URL") || `${origin}/api/stations/${stationId}`;
        const response = await fetch(convexUrl);

        if (!response.ok) {
            throw new Error(`Station not found: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Error fetching station data:", error);
        return null;
    }
}

export default async (request: Request, context: Context) => {
    const { origin } = new URL(request.url);
    const { stationId } = context.params;

    if (!stationId) {
        return new Response("Station ID is required", { status: 400 });
    }

    // Fetch station data
    const stationData = await getStationData(stationId, origin);

    if (!stationData) {
        return new Response("Station not found", { status: 404 });
    }

    // Extract data with safe defaults
    const stationName = stationData.station_name || "Unknown Station";
    const district = stationData.districts?.name || "Unknown District";
    const currentLevel = stationData.current_levels?.current_level || 0;
    const alertLevel = stationData.current_levels?.alert_level || "0";
    const updatedAt = stationData.current_levels?.updated_at;
    const isOnline = stationData.station_status || false;
    const cameraUrl = stationData.cameras?.img_url;
    const hasCameraImage = cameraUrl && stationData.cameras?.is_enabled;

    const alertInfo = getAlertInfo(alertLevel, isOnline);
    const lastUpdated = formatDateTime(updatedAt);

    // Choose layout based on camera availability
    if (hasCameraImage) {
        // Two-column layout with camera
        return new ImageResponse(
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
                        <img src={cameraUrl} alt="Live Camera" style={STYLES.cameraImage} />
                    </div>
                </div>
            ),
            { width: 1200, height: 630 }
        );
    } else {
        // Centered layout without camera
        return new ImageResponse(
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
        );
    }
};

export const config: Config = {
    path: "/og/station/:stationId"
};