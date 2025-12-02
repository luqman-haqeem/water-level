// Utility to generate OG image URLs with station data as parameters
// This ensures OG images always work, even if API is down

export function generateOGImageUrl(baseUrl: string, stationData: {
    id: string;
    station_name: string;
    districts?: { name: string };
    current_levels?: {
        current_level: number;
        alert_level: string;
        updated_at: string;
    };
    station_status: boolean;
    cameras?: {
        img_url?: string;
        is_enabled?: boolean;
    };
}): string {
    const params = new URLSearchParams();

    // Always include basic station info (fallback data)
    params.set('name', stationData.station_name);
    params.set('district', stationData.districts?.name || 'Unknown');
    params.set('online', stationData.station_status.toString());

    // Include current level data if available
    if (stationData.current_levels) {
        params.set('level', stationData.current_levels.current_level.toString());
        params.set('alert', stationData.current_levels.alert_level);
        params.set('updated', stationData.current_levels.updated_at);
    }

    // Include camera info if available
    if (stationData.cameras?.img_url) {
        params.set('camera', stationData.cameras.img_url);
        params.set('cameraEnabled', stationData.cameras.is_enabled?.toString() || 'false');
    }

    return `${baseUrl}/og/station/${stationData.id}?${params.toString()}`;
}

// Example usage in your station detail page:
/*
// pages/stations/[id].tsx
export async function generateMetadata({ params }: { params: { id: string } }) {
    const stationData = await getStationData(params.id);
    
    return {
        openGraph: {
            images: [generateOGImageUrl('https://riverlevel.netlify.app', stationData)]
        }
    };
}
*/