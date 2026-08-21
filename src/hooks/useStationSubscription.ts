import { useState, useCallback } from "react";
import {
    subscribeToStation,
    unsubscribeFromStation,
    isSubscribedToStation,
} from "@/services/notificationService";

interface UseStationSubscriptionReturn {
    isSubscribed: boolean;
    subscribe: () => Promise<void>;
    unsubscribe: () => Promise<void>;
    isLoading: boolean;
}

/**
 * Custom hook to manage station notification subscription state.
 * Uses localStorage for optimistic UI and syncs with OneSignal.
 *
 * @param stationId - The station's Convex document ID
 * @param stationName - Human-readable station name, stored alongside ID for display
 */
export function useStationSubscription(
    stationId: string,
    stationName: string = "Unknown Station"
): UseStationSubscriptionReturn {
    const [isSubscribed, setIsSubscribed] = useState<boolean>(() =>
        isSubscribedToStation(stationId)
    );
    const [isLoading, setIsLoading] = useState(false);

    const subscribe = useCallback(async () => {
        setIsLoading(true);
        setIsSubscribed(true); // optimistic update
        try {
            await subscribeToStation(stationId, stationName);
        } catch {
            // revert on error
            setIsSubscribed(isSubscribedToStation(stationId));
        } finally {
            setIsLoading(false);
        }
    }, [stationId, stationName]);

    const unsubscribe = useCallback(async () => {
        setIsLoading(true);
        setIsSubscribed(false); // optimistic update
        try {
            await unsubscribeFromStation(stationId);
        } catch {
            // revert on error
            setIsSubscribed(isSubscribedToStation(stationId));
        } finally {
            setIsLoading(false);
        }
    }, [stationId]);

    return {
        isSubscribed,
        subscribe,
        unsubscribe,
        isLoading,
    };
}
