import { useSnapshot } from "@/hooks/useSnapshot";
import type { TrendsSnapshot, TrendPoint } from "@/lib/snapshotTypes";

const EMPTY: TrendPoint[] = [];

/**
 * 3-hour trend for a station. Every StationCard calls this; they all share
 * one trends.json fetch instead of one subscription each.
 */
export function useStationTrend(stationId: string) {
    const { data } = useSnapshot<TrendsSnapshot>("trends");
    const points = data ? data.items[stationId] ?? EMPTY : undefined;
    return { data: points, isLoading: data === undefined && !!stationId };
}
