import { useQuery } from "@tanstack/react-query";
import { getConvexClient } from "@/lib/convexClient";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

export function useStationTrend(stationId: string) {
    return useQuery({
        queryKey: ["waterLevelHistory", "trend", stationId],
        queryFn: async () => {
            const client = getConvexClient();
            return await client.query(api.waterLevelHistory.getStationTrend, {
                stationId: stationId as Id<"stations">,
            });
        },
        enabled: !!stationId,
    });
}
