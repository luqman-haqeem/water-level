import { useQuery } from "@tanstack/react-query";
import { getConvexClient } from "@/lib/convexClient";
import { api } from "../convex/_generated/api";

export function useCameras() {
    return useQuery({
        queryKey: ["cameras", "withDetails"],
        queryFn: async () => {
            const client = getConvexClient();
            return await client.query(api.cameras.getCamerasWithDetails);
        },
    });
}
