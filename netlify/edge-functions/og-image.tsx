import type { Config, Context } from "https://edge.netlify.com/v1/mod.ts";

// Alert level color mapping
const ALERT_COLORS = {
    "0": { bg: "#10B981", label: "NORMAL" },
    "1": { bg: "#F59E0B", label: "ALERT" },
    "2": { bg: "#EF4444", label: "WARNING" },
    "3": { bg: "#DC2626", label: "DANGER" },
    "offline": { bg: "#6B7280", label: "OFFLINE" },
};

function getAlertInfo(alertLevel: string, isOnline: boolean) {
    if (!isOnline) return ALERT_COLORS.offline;
    return ALERT_COLORS[alertLevel as keyof typeof ALERT_COLORS] || ALERT_COLORS.offline;
}

// Secure function to fetch station data from your API
async function getStationData(stationId: string, origin: string) {
    try {
        console.log(`Fetching secure data for station: ${stationId}`);

        // Use your API route to get verified station data
        const apiUrl = `${origin}/api/stations/${stationId}`;
        const response = await fetch(apiUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Netlify Edge Function OG Generator'
            }
        });

        if (!response.ok) {
            console.error(`API response error: ${response.status}`);
            return null;
        }

        const data = await response.json();
        console.log(`Successfully fetched verified data for station: ${stationId}`);
        return data;
    } catch (error) {
        console.error("Error fetching station data:", error);
        return null;
    }
}

const handler = async (request: Request, context: Context) => {
    try {
        const { stationId } = context.params;
        const { origin } = new URL(request.url);

        if (!stationId) {
            return new Response("Station ID is required", { status: 400 });
        }

        // SECURITY: Fetch data from verified API instead of URL parameters
        const stationData = await getStationData(stationId, origin);

        if (!stationData) {
            // Fallback: Create a safe default image when API is unavailable
            const svg = `
                <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
                    <rect width="1200" height="630" fill="#ffffff"/>
                    <text x="600" y="280" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="48" font-weight="700" fill="#1F2937">
                        Water Level Monitoring
                    </text>
                    <text x="600" y="340" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="32" fill="#6B7280">
                        Station Data Loading...
                    </text>
                    <text x="600" y="400" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="24" fill="#9CA3AF">
                        Please visit our website for live updates
                    </text>
                </svg>
            `;

            return new Response(svg, {
                headers: {
                    'Content-Type': 'image/svg+xml',
                    'Cache-Control': 'public, s-maxage=60, max-age=60' // Shorter cache for fallback
                }
            });
        }

        // Extract verified data
        const stationName = stationData.station_name || "Unknown Station";
        const district = stationData.districts?.name || "Unknown District";
        const currentLevel = stationData.current_levels?.current_level || 0;
        const alertLevel = stationData.current_levels?.alert_level || "0";
        const isOnline = stationData.station_status || false;
        const cameraUrl = stationData.cameras?.img_url;
        const cameraEnabled = stationData.cameras?.is_enabled;

        const alertInfo = getAlertInfo(alertLevel, isOnline);
        const statusColor = isOnline ? "#10B981" : "#EF4444";
        const hasCameraImage = cameraUrl && cameraEnabled;

        // Create SVG OG image with camera support
        let svg: string;

        if (hasCameraImage) {
            // Two-column layout with camera
            svg = `
                <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
                    <!-- Background -->
                    <rect width="1200" height="630" fill="#ffffff"/>
                    
                    <!-- Left Column Content -->
                    <!-- Station Name -->
                    <text x="300" y="80" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="48" font-weight="700" fill="#1F2937">
                        ${stationName.length > 20 ? stationName.substring(0, 17) + "..." : stationName}
                    </text>
                    
                    <!-- District -->
                    <text x="300" y="120" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="24" fill="#6B7280">
                        ${district} District
                    </text>
                    
                    <!-- Alert Badge -->
                    <rect x="200" y="140" width="200" height="50" rx="12" fill="${alertInfo.bg}"/>
                    <text x="300" y="172" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="24" font-weight="700" fill="#FFFFFF">
                        ${alertInfo.label}
                    </text>
                    
                    <!-- Water Level -->
                    <text x="300" y="270" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="80" font-weight="700" fill="#1F2937">
                        ${currentLevel.toFixed(2)}m
                    </text>
                    
                    <!-- Water Level Label -->
                    <text x="300" y="310" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="24" fill="#6B7280">
                        Current Water Level
                    </text>
                    
                    <!-- Status -->
                    <circle cx="270" cy="360" r="6" fill="${statusColor}"/>
                    <text x="285" y="365" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="20" fill="#374151">
                        Station ${isOnline ? "Online" : "Offline"}
                    </text>
                    
                    <!-- Camera Image -->
                    <rect x="650" y="115" width="420" height="420" rx="20" fill="#F3F4F6" stroke="#E5E7EB" stroke-width="1"/>
                    <image x="650" y="115" width="420" height="420" href="${cameraUrl}" preserveAspectRatio="xMidYMid slice">
                        <title>Live Camera Feed</title>
                    </image>
                    
                    <!-- Camera Label -->
                    <text x="860" y="570" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="18" fill="#6B7280">
                        Live Camera
                    </text>
                </svg>
            `;
        } else {
            // Centered layout without camera (original design)
            svg = `
                <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
                    <!-- Background -->
                    <rect width="1200" height="630" fill="#ffffff"/>
                    
                    <!-- Station Name -->
                    <text x="600" y="120" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="56" font-weight="700" fill="#1F2937">
                        ${stationName.length > 25 ? stationName.substring(0, 22) + "..." : stationName}
                    </text>
                    
                    <!-- District -->
                    <text x="600" y="170" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="28" fill="#6B7280">
                        ${district} District
                    </text>
                    
                    <!-- Alert Badge -->
                    <rect x="500" y="200" width="200" height="60" rx="15" fill="${alertInfo.bg}"/>
                    <text x="600" y="240" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="28" font-weight="700" fill="#FFFFFF">
                        ${alertInfo.label}
                    </text>
                    
                    <!-- Water Level -->
                    <text x="600" y="360" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="140" font-weight="700" fill="#1F2937">
                        ${currentLevel.toFixed(2)}m
                    </text>
                    
                    <!-- Water Level Label -->
                    <text x="600" y="420" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="32" fill="#6B7280">
                        Current Water Level
                    </text>
                    
                    <!-- Status -->
                    <circle cx="570" cy="500" r="8" fill="${statusColor}"/>
                    <text x="590" y="507" font-family="system-ui, -apple-system, sans-serif" 
                          font-size="26" fill="#374151">
                        Station ${isOnline ? "Online" : "Offline"}
                    </text>
                </svg>
            `;
        }

        return new Response(svg, {
            headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'public, s-maxage=300, max-age=300'
            }
        });
    } catch (error) {
        console.error('OG Image generation error:', error);
        return new Response(`Error generating image`, {
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
};

export default handler;

export const config: Config = {
    path: "/og/station/:stationId"
};