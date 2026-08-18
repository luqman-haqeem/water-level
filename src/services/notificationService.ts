import OneSignal from "react-onesignal";

const STORAGE_KEY = "subscribed_stations";

/**
 * Get the list of subscribed stations from localStorage.
 */
export function getSubscribedStations(): string[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];
        return JSON.parse(stored) as string[];
    } catch {
        return [];
    }
}

/**
 * Check if a specific station is subscribed.
 */
export function isSubscribedToStation(stationId: string): boolean {
    const stations = getSubscribedStations();
    return stations.includes(stationId);
}

/**
 * Save the subscribed stations list to localStorage.
 */
function saveSubscribedStations(stations: string[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stations));
}

/**
 * Subscribe to notifications for a specific station.
 * Updates localStorage immediately (optimistic) and calls OneSignal to add the tag.
 * On first subscribe, also opts in to push notifications if not already opted in.
 */
export async function subscribeToStation(stationId: string): Promise<void> {
    // Update localStorage first (optimistic)
    const stations = getSubscribedStations();
    if (!stations.includes(stationId)) {
        stations.push(stationId);
        saveSubscribedStations(stations);
    }

    // Try to sync with OneSignal
    try {
        // Opt in to push if not already opted in
        if (!OneSignal.User.PushSubscription.optedIn) {
            await OneSignal.User.PushSubscription.optIn();
        }

        await OneSignal.User.addTag(`station_${stationId}`, "true");
    } catch (error) {
        // OneSignal not initialized or unavailable - localStorage is still updated
        console.warn(
            "[notificationService] OneSignal operation failed, localStorage updated:",
            error
        );
    }
}

/**
 * Unsubscribe from notifications for a specific station.
 * Updates localStorage immediately (optimistic) and calls OneSignal to remove the tag.
 */
export async function unsubscribeFromStation(stationId: string): Promise<void> {
    // Update localStorage first (optimistic)
    const stations = getSubscribedStations();
    const filtered = stations.filter((id) => id !== stationId);
    saveSubscribedStations(filtered);

    // Try to sync with OneSignal
    try {
        await OneSignal.User.removeTag(`station_${stationId}`);
    } catch (error) {
        // OneSignal not initialized or unavailable - localStorage is still updated
        console.warn(
            "[notificationService] OneSignal operation failed, localStorage updated:",
            error
        );
    }
}
