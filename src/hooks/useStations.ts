import { useSnapshot } from "@/hooks/useSnapshot";
import type { StationsSnapshot } from "@/lib/snapshotTypes";

/** All stations with details, from the R2 snapshot (polled, ETag-revalidated). */
export function useStations() {
    const { data } = useSnapshot<StationsSnapshot>("stations");
    return { data: data?.items, isLoading: data === undefined };
}
