import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * Reactively subscribes to all enabled cameras with district details.
 * Convex pushes updates automatically when camera data changes.
 */
export function useCameras() {
    const data = useQuery(api.cameras.getCamerasWithDetails);
    return {
        data,
        isLoading: data === undefined,
    };
}
