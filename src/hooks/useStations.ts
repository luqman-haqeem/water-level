import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSnapshot } from "@/hooks/useSnapshot";
import { dataSource } from "@/lib/snapshotEnv";
import type { StationsSnapshot } from "@/lib/snapshotTypes";

function useStationsConvex() {
    const data = useQuery(api.stations.getStationsWithDetails);
    return { data, isLoading: data === undefined };
}

function useStationsSnapshot() {
    const { data } = useSnapshot<StationsSnapshot>("stations");
    return { data: data?.items, isLoading: data === undefined };
}

/**
 * All stations with details. Reads the R2 snapshot (polled, ETag-revalidated);
 * VITE_DATA_SOURCE=convex restores the live Convex subscription (phase-2 rollback).
 */
export const useStations = dataSource() === "convex" ? useStationsConvex : useStationsSnapshot;
