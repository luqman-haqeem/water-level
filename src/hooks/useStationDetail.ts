import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

/**
 * Reactively subscribes to a single station's details (current level, camera, district).
 * Uses the optimized `getStationDetailById` query (4 DB lookups instead of all stations).
 * Convex pushes updates automatically when this station's water level changes.
 */
export function useStationDetail(stationId: string | undefined) {
    const data = useQuery(
        api.stations.getStationDetailById,
        stationId ? { stationId: stationId as Id<"stations"> } : "skip"
    );
    return {
        data: data ?? null,
        isLoading: data === undefined && !!stationId,
    };
}
