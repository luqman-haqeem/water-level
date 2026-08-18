import { useQuery } from "@tanstack/react-query";
import { getConvexClient } from "@/lib/convexClient";
import { api } from "../../convex/_generated/api";

export function useStations() {
    return useQuery({
        queryKey: ["stations", "withDetails"],
        queryFn: async () => {
            const client = getConvexClient();
            return await client.query(api.stations.getStationsWithDetails);
        },
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
