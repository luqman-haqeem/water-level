import { useQuery } from "@tanstack/react-query";
import { getConvexClient } from "@/lib/convexClient";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

/**
 * Fetches a single station with all its details (current level, camera, district).
 * Uses the optimized `getStationDetailById` query which does only 4 DB lookups
 * instead of loading all ~40 stations.
 */
export function useStationDetail(stationId: string | undefined) {
    return useQuery({
        queryKey: ["station", "detail", stationId],
        queryFn: async () => {
            if (!stationId) return null;
            const client = getConvexClient();
            return await client.query(api.stations.getStationDetailById, {
                stationId: stationId as Id<"stations">,
            });
        },
        enabled: !!stationId,
    });
}
