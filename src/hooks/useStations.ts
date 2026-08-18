import { useQuery } from "@tanstack/react-query";
import { getConvexClient } from "@/lib/convexClient";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export function useStations() {
    return useQuery({
        queryKey: ["stations", "withDetails"],
        queryFn: async () => {
            const client = getConvexClient();
            return await client.query(api.stations.getStationsWithDetails);
        },
    });
}

export function useStationDetail(stationId: Id<"stations"> | undefined) {
    return useQuery({
        queryKey: ["stations", "detail", stationId],
        queryFn: async () => {
            const client = getConvexClient();
            return await client.query(api.stations.getStationDetailById, {
                stationId: stationId!,
            });
        },
        enabled: !!stationId,
    });
}

export function useDistricts() {
    return useQuery({
        queryKey: ["districts"],
        queryFn: async () => {
            const client = getConvexClient();
            return await client.query(api.stations.getDistricts);
        },
    });
}
