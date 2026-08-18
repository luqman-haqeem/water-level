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
 */
export function useStationSubscription(
    stationId: string
): UseStationSubscriptionReturn {
    const [isSubscribed, setIsSubscribed] = useState<boolean>(() =>
        isSubscribedToStation(stationId)
    );
    const [isLoading, setIsLoading] = useState(false);

    const subscribe = useCallback(async () => {
        setIsLoading(true);
        try {
            await subscribeToStation(stationId);
            setIsSubscribed(isSubscribedToStation(stationId));
        } catch {
            // On error, re-read the actual state from localStorage
            setIsSubscribed(isSubscribedToStation(stationId));
        } finally {
            setIsLoading(false);
        }
    }, [stationId]);

    const unsubscribe = useCallback(async () => {
        setIsLoading(true);
        try {
            await unsubscribeFromStation(stationId);
            setIsSubscribed(isSubscribedToStation(stationId));
        } catch {
            // On error, re-read the actual state from localStorage
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
