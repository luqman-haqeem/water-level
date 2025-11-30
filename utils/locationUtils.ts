/**
 * Location utilities for distance calculation and geolocation
 */

export interface Coordinates {
    latitude: number;
    longitude: number;
}

export interface LocationState {
    isLoading: boolean;
    isSupported: boolean;
    isPermissionGranted: boolean;
    coordinates: Coordinates | null;
    error: string | null;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param coord1 First coordinate
 * @param coord2 Second coordinate
 * @returns Distance in kilometers
 */
export function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRadians(coord2.latitude - coord1.latitude);
    const dLon = toRadians(coord2.longitude - coord1.longitude);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(coord1.latitude)) * Math.cos(toRadians(coord2.latitude)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

/**
 * Request user's current location
 */
export function getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by this browser'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000 // 5 minutes cache
            }
        );
    });
}

/**
 * Check if geolocation is supported
 */
export function isGeolocationSupported(): boolean {
    return 'geolocation' in navigator;
}

/**
 * Request geolocation permission
 */
export async function requestLocationPermission(): Promise<PermissionState> {
    if (!('permissions' in navigator)) {
        // Fallback for browsers without permission API
        try {
            await getCurrentPosition();
            return 'granted';
        } catch {
            return 'denied';
        }
    }

    try {
        const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        return permission.state;
    } catch {
        // Fallback if permission query fails
        try {
            await getCurrentPosition();
            return 'granted';
        } catch {
            return 'denied';
        }
    }
}

/**
 * Format distance for display
 */
export function formatDistance(distance: number): string {
    if (distance < 1) {
        return `${Math.round(distance * 1000)}m`;
    }
    return `${distance}km`;
}

