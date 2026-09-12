import { useMemo } from "react";
import { useSnapshot } from "@/hooks/useSnapshot";
import type { StationsSnapshot } from "@/lib/snapshotTypes";

/** One station's details (same item shape as the list). */
export function useStationDetail(stationId: string | undefined) {
    const { data } = useSnapshot<StationsSnapshot>("stations");
    const station = useMemo(
        () => (stationId && data ? data.items.find((s) => s.id === stationId) ?? null : null),
        [data, stationId]
    );
    return { data: station, isLoading: data === undefined && !!stationId };
}
