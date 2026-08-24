import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

/**
 * Reactively subscribes to the 3-hour water level trend for a station.
 * Updates automatically as new readings come in.
 */
export function useStationTrend(stationId: string) {
    const data = useQuery(
        api.waterLevelHistory.getStationTrend,
        stationId ? { stationId: stationId as Id<"stations"> } : "skip"
    );
    return {
        data,
        isLoading: data === undefined && !!stationId,
    };
}
