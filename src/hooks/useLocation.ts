import { useState, useEffect, useCallback } from 'react';
import {
    LocationState,
    Coordinates,
    getCurrentPosition,
    isGeolocationSupported,
    requestLocationPermission
} from '@/utils/locationUtils';

export function useLocation() {
    const [locationState, setLocationState] = useState<LocationState>({
        isLoading: false,
        isSupported: false,
        isPermissionGranted: false,
        coordinates: null,
        error: null
    });

    // Check geolocation support on mount
    useEffect(() => {
        setLocationState(prev => ({
            ...prev,
            isSupported: isGeolocationSupported()
        }));
    }, []);

    const requestLocation = useCallback(async () => {
        if (!isGeolocationSupported()) {
            setLocationState(prev => ({
                ...prev,
                error: 'Geolocation is not supported by this browser',
                coordinates: null // Don't use fallback coordinates
            }));
            return;
        }

        setLocationState(prev => ({
            ...prev,
            isLoading: true,
            error: null
        }));

        try {
            // Check permission first
            const permissionState = await requestLocationPermission();

            if (permissionState === 'denied') {
                setLocationState(prev => ({
                    ...prev,
                    isLoading: false,
                    isPermissionGranted: false,
                    error: 'Location permission denied',
                    coordinates: null // Don't use fallback coordinates
                }));
                return;
            }

            // Get current position
            const position = await getCurrentPosition();
            const coordinates: Coordinates = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };

            setLocationState({
                isLoading: false,
                isSupported: true,
                isPermissionGranted: true,
                coordinates,
                error: null
            });

        } catch (error) {
            console.warn('Failed to get location:', error);
            setLocationState(prev => ({
                ...prev,
                isLoading: false,
                error: error instanceof Error ? error.message : 'Failed to get location',
                coordinates: null // Don't use fallback coordinates
            }));
        }
    }, []);

    const clearLocation = useCallback(() => {
        setLocationState({
            isLoading: false,
            isSupported: isGeolocationSupported(),
            isPermissionGranted: false,
            coordinates: null,
            error: null
        });
    }, []);

    return {
        ...locationState,
        requestLocation,
        clearLocation,
        hasLocation: !!locationState.coordinates
    };
}