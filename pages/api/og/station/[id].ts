import { NextApiRequest, NextApiResponse } from 'next';
import { createCanvas, loadImage, registerFont, Canvas } from 'canvas';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';

// Initialize Convex client for API routes
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

interface StationData {
    id: string;
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
    normal_water_level: number;
    alert_water_level: number;
    warning_water_level: number;
    danger_water_level: number;
    station_status: boolean;
}

// Alert level color mapping
const ALERT_COLORS = {
    normal: { bg: '#10B981', text: '#FFFFFF', label: 'NORMAL' },
    alert: { bg: '#F59E0B', text: '#FFFFFF', label: 'ALERT' },
    warning: { bg: '#EF4444', text: '#FFFFFF', label: 'WARNING' },
    danger: { bg: '#DC2626', text: '#FFFFFF', label: 'DANGER' },
    offline: { bg: '#6B7280', text: '#FFFFFF', label: 'OFFLINE' }
};

function getAlertInfo(alertLevel: number, isOnline: boolean) {
    if (!isOnline) return ALERT_COLORS.offline;

    switch (alertLevel) {
        case 0: return ALERT_COLORS.normal;
        case 1: return ALERT_COLORS.alert;
        case 2: return ALERT_COLORS.warning;
        case 3: return ALERT_COLORS.danger;
        default: return ALERT_COLORS.offline;
    }
}

function formatDateTime(dateString?: string) {
    if (!dateString) return 'No recent data';

    try {
        const date = new Date(dateString);
        return date.toLocaleString('en-MY', {
            timeZone: 'Asia/Kuala_Lumpur',
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return 'Invalid date';
    }
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

async function generateOGImage(stationData: StationData): Promise<Buffer> {
    const width = 1200;
    const height = 630;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // White background (removed blue gradient)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Check if camera is available to determine layout
    const hasCameraImage = stationData.cameras?.img_url && stationData.cameras.is_enabled;

    // For centered layout, we need these variables defined earlier
    const badgeWidth = 200;
    const badgeHeight = 60;

    // Station name as main title - positioning depends on layout
    const stationName = stationData.station_name || 'Unknown Station';

    // Get alert information
    const alertLevel = parseInt(stationData.current_levels?.alert_level || '0');
    const isOnline = stationData.station_status;
    const alertInfo = getAlertInfo(alertLevel, isOnline);

    // Water level value - define once for use in both layouts
    const currentLevel = stationData.current_levels?.current_level || 0;

    if (!hasCameraImage) {
        // Centered layout for stations without camera - similar to Netlify Dev guide design

        // Station name - centered and prominent
        ctx.font = 'bold 56px Arial';
        ctx.fillStyle = '#1F2937';
        ctx.textAlign = 'center';
        ctx.fillText(stationName.length > 25 ? stationName.substring(0, 22) + '...' : stationName, width / 2, 120);

        // District info - centered below title
        ctx.font = '28px Arial';
        ctx.fillStyle = '#6B7280';
        ctx.textAlign = 'center';
        ctx.fillText(`${stationData.districts.name} District`, width / 2, 160);

        // Alert badge - centered
        const centerBadgeX = (width - badgeWidth) / 2;
        const centerBadgeY = 200;

        ctx.fillStyle = alertInfo.bg;
        drawRoundedRect(ctx, centerBadgeX, centerBadgeY, badgeWidth, badgeHeight, 15);
        ctx.fill();

        ctx.fillStyle = alertInfo.text;
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(alertInfo.label, centerBadgeX + badgeWidth / 2, centerBadgeY + 40);

        // Water level - large and centered (hero element)
        ctx.font = 'bold 140px Arial';
        ctx.fillStyle = '#1F2937';
        ctx.textAlign = 'center';
        ctx.fillText(`${currentLevel.toFixed(2)}m`, width / 2, 380);

        // Water level label - centered below the value
        ctx.font = '32px Arial';
        ctx.fillStyle = '#6B7280';
        ctx.textAlign = 'center';
        ctx.fillText('Current Water Level', width / 2, 420);

        // Last updated - centered
        const lastUpdated = formatDateTime(stationData.current_levels?.updated_at);
        ctx.font = '24px Arial';
        ctx.fillStyle = '#6B7280';
        ctx.textAlign = 'center';
        ctx.fillText(`Last Updated: ${lastUpdated}`, width / 2, 480);

        // Status indicator with dot - centered
        const statusText = `Station ${isOnline ? 'Online' : 'Offline'}`;
        ctx.font = '26px Arial';
        ctx.fillStyle = '#374151';
        ctx.textAlign = 'center';

        // Measure text to position the status dot
        const textMetrics = ctx.measureText(statusText);
        const textX = width / 2;
        const textY = 520;

        // Draw status dot before text
        ctx.fillStyle = isOnline ? '#10B981' : '#EF4444';
        ctx.beginPath();
        ctx.arc(textX - textMetrics.width / 2 - 20, textY - 8, 8, 0, 2 * Math.PI);
        ctx.fill();

        // Draw status text
        ctx.fillStyle = '#374151';
        ctx.fillText(statusText, textX, textY);

    } else {
        // Left-aligned layout when camera is available - similar clean style

        // Station name - larger and prominent on left
        ctx.fillStyle = '#1F2937';
        ctx.font = 'bold 56px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(stationName.length > 25 ? stationName.substring(0, 22) + '...' : stationName, 40, 100);

        // District info - consistent with centered layout
        ctx.font = '28px Arial';
        ctx.fillStyle = '#6B7280';
        ctx.fillText(`${stationData.districts.name} District`, 40, 140);

        // Alert level badge - left aligned with better positioning
        const badgeX = 40;
        const badgeY = 170;

        ctx.fillStyle = alertInfo.bg;
        drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 15);
        ctx.fill();

        ctx.fillStyle = alertInfo.text;
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(alertInfo.label, badgeX + badgeWidth / 2, badgeY + 40);

        // Water level display - larger and more prominent
        ctx.fillStyle = '#1F2937';
        ctx.font = 'bold 80px Arial'; // Increased from 64px
        ctx.textAlign = 'left';
        ctx.fillText(`${currentLevel.toFixed(2)}m`, 40, 310);

        // Water level label - consistent styling
        ctx.font = '28px Arial';
        ctx.fillStyle = '#6B7280';
        ctx.fillText('Current Water Level', 40, 350);

        // Last updated section - better spacing
        const lastUpdated = formatDateTime(stationData.current_levels?.updated_at);
        ctx.font = '22px Arial';
        ctx.fillStyle = '#6B7280';
        ctx.fillText(`Last Updated: ${lastUpdated}`, 40, 400);

        // Status indicator with circular dot - consistent with centered layout
        const statusText = `Station ${isOnline ? 'Online' : 'Offline'}`;
        ctx.font = '24px Arial';
        ctx.fillStyle = '#374151';

        // Draw status dot before text
        ctx.fillStyle = isOnline ? '#10B981' : '#EF4444';
        ctx.beginPath();
        ctx.arc(40 + 8, 440 - 8, 8, 0, 2 * Math.PI);
        ctx.fill();

        // Draw status text
        ctx.fillStyle = '#374151';
        ctx.fillText(statusText, 64, 440);
    }

    // Camera image section (even larger size) - only render if available
    if (hasCameraImage) {
        try {
            const img = await loadImage(stationData.cameras!.img_url!);
            const imgSize = 420; // Slightly smaller to accommodate better left content spacing
            const imgX = width - imgSize - 60; // More margin from right edge
            const imgY = 80; // Positioned to align with content

            // Draw image with rounded corners
            ctx.save();
            drawRoundedRect(ctx, imgX, imgY, imgSize, imgSize, 20);
            ctx.clip();
            ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
            ctx.restore();

            // Image label - positioned below image
            ctx.font = '18px Arial';
            ctx.fillStyle = '#6B7280';
            ctx.textAlign = 'center';
            ctx.fillText('Live Camera', imgX + imgSize / 2, imgY + imgSize + 30);
        } catch (error) {
            // If image loading fails, don't show anything (fall back to no-camera layout)
            console.warn('Failed to load camera image, using no-camera layout:', error);
        }
    }

    return canvas.toBuffer('image/png');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Station ID is required' });
    }

    try {
        // Fetch station data from Convex
        const stationData = await convex.query(api.stations.getStationDetailById, {
            stationId: id as Id<"stations">
        });

        if (!stationData) {
            return res.status(404).json({ error: 'Station not found' });
        }

        // Generate the Open Graph image
        const imageBuffer = await generateOGImage(stationData);

        // Set appropriate headers
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=300'); // Cache for 5 minutes
        res.setHeader('Content-Length', imageBuffer.length);

        // Send the image
        res.status(200).send(imageBuffer);
    } catch (error) {
        console.error('Error generating OG image:', error);
        res.status(500).json({ error: 'Failed to generate image' });
    }
}