import { useSnapshot } from "@/hooks/useSnapshot";
import type { CamerasSnapshot } from "@/lib/snapshotTypes";

/** All enabled cameras with district details, from the R2 snapshot. */
export function useCameras() {
    const { data } = useSnapshot<CamerasSnapshot>("cameras");
    return { data: data?.items, isLoading: data === undefined };
}
