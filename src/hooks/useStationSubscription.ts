import { useState, useCallback } from "react";
import {
    subscribeToStation,
    unsubscribeFromStation,
    isSubscribedToStation,
    type SubscribeResult,
} from "@/services/notificationService";
import { canReceivePush } from "@/utils/pushSupport";

interface UseStationSubscriptionReturn {
    isSubscribed: boolean;
    subscribe: () => Promise<SubscribeResult>;
    unsubscribe: () => Promise<void>;
    isLoading: boolean;
}

/**
 * Custom hook to manage station notification subscription state.
 * Uses localStorage for optimistic UI and syncs with OneSignal.
 *
 * A station only reads as subscribed when this device can actually receive
 * push (supported platform + granted permission). Otherwise an iOS Safari tab,
 * or a browser whose permission was later revoked, would show "Alerts On" for
 * alerts that can never arrive (#78).
 *
 * @param stationId - The station's Convex document ID
 * @param stationName - Human-readable station name, stored alongside ID for display
 * @param district - District name, recorded on the `station_watched` event
 */
export function useStationSubscription(
    stationId: string,
    stationName: string = "Unknown Station",
    district?: string
): UseStationSubscriptionReturn {
    const [isSubscribed, setIsSubscribed] = useState<boolean>(() =>
        isSubscribedToStation(stationId) && canReceivePush()
    );
    const [isLoading, setIsLoading] = useState(false);

    const subscribe = useCallback(async (): Promise<SubscribeResult> => {
        setIsLoading(true);
        setIsSubscribed(true); // optimistic update
        try {
            const result = await subscribeToStation(stationId, stationName, district);
            if (!result.permissionGranted) {
                // Revert optimistic React state; localStorage rollback is handled by subscribeToStation
                setIsSubscribed(false);
            }
            return result;
        } catch {
            // revert on error
            setIsSubscribed(isSubscribedToStation(stationId) && canReceivePush());
            return { permissionGranted: false, reason: "unavailable" };
        } finally {
            setIsLoading(false);
        }
    }, [stationId, stationName, district]);

    const unsubscribe = useCallback(async () => {
        setIsLoading(true);
        setIsSubscribed(false); // optimistic update
        try {
            await unsubscribeFromStation(stationId);
        } catch {
            // revert on error
            setIsSubscribed(isSubscribedToStation(stationId) && canReceivePush());
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
