import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * Reactively subscribes to all stations with their details.
 * Convex pushes updates automatically when water levels change —
 * no polling or manual refresh needed.
 */
export function useStations() {
    const data = useQuery(api.stations.getStationsWithDetails);
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
