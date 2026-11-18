import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";

type Stations = FunctionReturnType<typeof api.stations.getStationsWithDetails>;

// Bump the version when the shape returned by getStationsWithDetails changes.
export const STATIONS_CACHE_KEY = "water-level-stations-cache-v1";

function readCachedStations(): Stations | undefined {
    try {
        const stored = localStorage.getItem(STATIONS_CACHE_KEY);
        if (!stored) return undefined;
        const parsed: unknown = JSON.parse(stored);
        if (
            !Array.isArray(parsed) ||
            !parsed.every(
                (s) =>
                    typeof s?.id === "string" &&
                    typeof s?.station_name === "string" &&
                    typeof s?.districts?.name === "string"
            )
        ) {
            return undefined;
        }
        return parsed as Stations;
    } catch {
        return undefined;
    }
}

/**
 * Reactively subscribes to all stations with their details.
 * Convex pushes updates automatically when water levels change —
 * no polling or manual refresh needed.
 *
 * Until the first Convex result arrives, returns the last list this browser
 * received. The station cards are the page's largest-contentful-paint element,
 * and waiting for the WebSocket to connect added 1.5–2s to LCP on every load.
 * Cached readings are safe to show briefly: anything older than the staleness
 * threshold already renders as "no data".
 */
export function useStations() {
    const live = useQuery(api.stations.getStationsWithDetails);
    const [cached] = useState(readCachedStations);

    useEffect(() => {
        if (live === undefined) return;
        try {
            localStorage.setItem(STATIONS_CACHE_KEY, JSON.stringify(live));
        } catch {
            // Storage full or unavailable (private mode): fall back to live-only.
        }
    }, [live]);

    const data = live ?? cached;
    return {
        data,
        isLoading: data === undefined,
    };
}

/**
 * Reactively subscribes to the districts list.
 */
export function useDistricts() {
    const data = useQuery(api.stations.getDistricts);
    return {
        data,
        isLoading: data === undefined,
    };
}
