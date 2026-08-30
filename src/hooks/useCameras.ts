import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSnapshot } from "@/hooks/useSnapshot";
import { dataSource } from "@/lib/snapshotEnv";
import type { CamerasSnapshot } from "@/lib/snapshotTypes";

function useCamerasConvex() {
    const data = useQuery(api.cameras.getCamerasWithDetails);
    return { data, isLoading: data === undefined };
}

function useCamerasSnapshot() {
    const { data } = useSnapshot<CamerasSnapshot>("cameras");
    return { data: data?.items, isLoading: data === undefined };
}

/**
 * All enabled cameras with district details. Reads the R2 snapshot;
 * VITE_DATA_SOURCE=convex restores the live Convex subscription (phase-2 rollback).
 */
export const useCameras = dataSource() === "convex" ? useCamerasConvex : useCamerasSnapshot;
