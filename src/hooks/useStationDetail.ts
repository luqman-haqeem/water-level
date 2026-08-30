import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useSnapshot } from "@/hooks/useSnapshot";
import { dataSource } from "@/lib/snapshotEnv";
import type { StationsSnapshot } from "@/lib/snapshotTypes";

function useStationDetailConvex(stationId: string | undefined) {
    const data = useQuery(
        api.stations.getStationDetailById,
        stationId ? { stationId: stationId as Id<"stations"> } : "skip"
    );
    return { data: data ?? null, isLoading: data === undefined && !!stationId };
}

function useStationDetailSnapshot(stationId: string | undefined) {
    const { data } = useSnapshot<StationsSnapshot>("stations");
    const station = useMemo(
        () => (stationId && data ? data.items.find((s) => s.id === stationId) ?? null : null),
        [data, stationId]
    );
    return { data: station, isLoading: data === undefined && !!stationId };
}

/** One station's details (same item shape as the list). */
export const useStationDetail = dataSource() === "convex" ? useStationDetailConvex : useStationDetailSnapshot;
