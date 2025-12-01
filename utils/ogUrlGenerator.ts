// SECURE Utility to generate OG image URLs
// No longer accepts user parameters - all data comes from verified API

export function generateSecureOGImageUrl(baseUrl: string, stationId: string): string {
    // SECURITY: Only station ID is needed, all data fetched from secure API
    return `${baseUrl}/og/station/${stationId}`;
}

// Example usage in your station detail page:
/*
// pages/stations/[id].tsx
export async function generateMetadata({ params }: { params: { id: string } }) {    
    return {
        openGraph: {
            images: [generateSecureOGImageUrl('https://riverlevel.netlify.app', params.id)]
        }
    };
}

// URLs are now secure and simple:
// /og/station/01GR7RMHC5S9TZQMHEBK5AV2KT (gets real data from API)
// /og/station/invalid-id (shows fallback image)

// Benefits:
// ✅ No user manipulation possible
// ✅ All data verified from database
// ✅ Fallback for API issues
// ✅ Clean, simple URLs
// ✅ Cache-friendly
*/// Example usage in your station detail page:
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