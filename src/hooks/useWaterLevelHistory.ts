import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useSnapshot } from "@/hooks/useSnapshot";
import { dataSource } from "@/lib/snapshotEnv";
import type { TrendsSnapshot, TrendPoint } from "@/lib/snapshotTypes";

const EMPTY: TrendPoint[] = [];

function useStationTrendConvex(stationId: string) {
    const data = useQuery(
        api.waterLevelHistory.getStationTrend,
        stationId ? { stationId: stationId as Id<"stations"> } : "skip"
    );
    return { data, isLoading: data === undefined && !!stationId };
}

function useStationTrendSnapshot(stationId: string) {
    const { data } = useSnapshot<TrendsSnapshot>("trends");
    const points = data ? data.items[stationId] ?? EMPTY : undefined;
    return { data: points, isLoading: data === undefined && !!stationId };
}

/**
 * 3-hour trend for a station. Every StationCard calls this; with the snapshot
 * source they all share one trends.json fetch instead of one subscription each.
 */
export const useStationTrend = dataSource() === "convex" ? useStationTrendConvex : useStationTrendSnapshot;
