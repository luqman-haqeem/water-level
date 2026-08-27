import OneSignal from "react-onesignal";

const STORAGE_KEY = "subscribed_stations";

export interface SubscribedStation {
    id: string;
    name: string;
}

/**
 * Get the list of subscribed stations from localStorage.
 * Returns {id, name} tuples so the UI can display human-readable names.
 *
 * Handles legacy format (plain string[]) by migrating to the tuple format
 * with a fallback name of "Unknown Station".
 */
export function getSubscribedStations(): SubscribedStation[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored);

        // Handle legacy format: plain string array
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "string") {
            const migrated: SubscribedStation[] = (parsed as string[]).map((id) => ({
                id,
                name: "Unknown Station",
            }));
            // Persist the migrated format
            localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
            return migrated;
        }

        return parsed as SubscribedStation[];
    } catch {
        return [];
    }
}

/**
 * Get just the IDs of subscribed stations (for internal use and backward compatibility).
 */
export function getSubscribedStationIds(): string[] {
    return getSubscribedStations().map((s) => s.id);
}

/**
 * Check if a specific station is subscribed.
 */
export function isSubscribedToStation(stationId: string): boolean {
    const stations = getSubscribedStations();
    return stations.some((s) => s.id === stationId);
}

/**
 * Save the subscribed stations list to localStorage.
 */
export function saveSubscribedStations(stations: SubscribedStation[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stations));
}

/**
 * Subscribe to notifications for a specific station.
 * Updates localStorage immediately (optimistic) and calls OneSignal to add the tag.
 * On first subscribe, also opts in to push notifications if not already opted in.
 *
 * @param stationId - The station's Convex document ID
 * @param stationName - Human-readable station name for display in the subscription dialog
 * @returns Object indicating whether push notification permission was granted
 */
export async function subscribeToStation(
    stationId: string,
    stationName: string = "Unknown Station"
): Promise<{ permissionGranted: boolean }> {
    // Update localStorage first (optimistic)
    const stations = getSubscribedStations();
    if (!stations.some((s) => s.id === stationId)) {
        stations.push({ id: stationId, name: stationName });
        saveSubscribedStations(stations);
    }

    // Try to sync with OneSignal
    try {
        // Opt in to push if not already opted in
        if (!OneSignal.User.PushSubscription.optedIn) {
            await OneSignal.User.PushSubscription.optIn();
        }

        // Check if permission was denied after the opt-in attempt
        if (Notification.permission === "denied") {
            // Rollback localStorage
            const rollback = getSubscribedStations().filter((s) => s.id !== stationId);
            saveSubscribedStations(rollback);
            return { permissionGranted: false };
        }

        await OneSignal.User.addTag(`station_${stationId}`, "true");
        return { permissionGranted: true };
    } catch (error) {
        // OneSignal not initialized or unavailable
        console.warn(
            "[notificationService] OneSignal operation failed:",
            error
        );
        return { permissionGranted: false };
    }
}

/**
 * Unsubscribe from notifications for a specific station.
 * Updates localStorage immediately (optimistic) and calls OneSignal to remove the tag.
 */
export async function unsubscribeFromStation(stationId: string): Promise<void> {
    // Update localStorage first (optimistic)
    const stations = getSubscribedStations();
    const filtered = stations.filter((s) => s.id !== stationId);
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

/**
 * Reconcile OneSignal device tags with localStorage at startup.
 *
 * This addresses the drift problem: if OneSignal tags and localStorage become
 * out of sync (e.g., OneSignal init failed during a previous subscribe, or
 * browser data was cleared), this function pulls the current tags from
 * OneSignal and merges them with localStorage to produce a consistent state.
 *
 * Strategy:
 * - Tags present in OneSignal but not in localStorage are added to localStorage
 *   (with a fallback name since OneSignal tags don't store the station name).
 * - Entries in localStorage that have no corresponding OneSignal tag get their
 *   tags re-added to OneSignal.
 */
export async function reconcileTagsWithLocalStorage(): Promise<void> {
    try {
        const osTags = await OneSignal.User.getTags();
        const localStations = getSubscribedStations();
        const localIds = new Set(localStations.map((s) => s.id));

        let changed = false;

        // Find tags in OneSignal that are not in localStorage and add them
        for (const [key, value] of Object.entries(osTags)) {
            if (key.startsWith("station_") && value === "true") {
                const stationId = key.replace("station_", "");
                if (!localIds.has(stationId)) {
                    localStations.push({ id: stationId, name: "Unknown Station" });
                    changed = true;
                }
            }
        }

        // Find localStorage entries with no matching OneSignal tag and re-add them
        for (const station of localStations) {
            const tagKey = `station_${station.id}`;
            if (!osTags[tagKey] || osTags[tagKey] !== "true") {
                await OneSignal.User.addTag(tagKey, "true");
            }
        }

        if (changed) {
            saveSubscribedStations(localStations);
        }
    } catch (error) {
        console.warn(
            "[notificationService] Tag reconciliation failed:",
            error
        );
    }
}
