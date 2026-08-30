import { useSnapshot } from "@/hooks/useSnapshot";
import { getFreshnessState } from "@/lib/freshness";
import type { SnapshotMeta } from "@/lib/snapshotTypes";
import formatTimestamp from "@/utils/timeUtils";
import { cn } from "@/lib/utils";

const ago = (iso: string | null) => (iso ? formatTimestamp(iso) : "unknown");

/**
 * Global banner explaining *why* data may be old: JPS lagging, JPS unreachable,
 * or our own snapshot server unreachable. Sits under OfflineBanner.
 */
export function DataFreshnessBanner() {
    const { data: meta, error } = useSnapshot<SnapshotMeta>("meta");
    const state = getFreshnessState(meta, error, Date.now());

    if (state.kind === "fresh") return null;

    const tone =
        state.kind === "upstream-down"
            ? "bg-destructive/90 text-destructive-foreground"
            : state.kind === "jps-lagging"
              ? "bg-warning/90 text-warning-foreground"
              : "bg-muted text-muted-foreground";

    const message =
        state.kind === "jps-lagging"
            ? `JPS last reported ${ago(state.jpsLastUpdate)}. Their feed is lagging — we last checked ${ago(state.attemptedAt)}.`
            : state.kind === "upstream-down"
              ? `Can't reach JPS since ${ago(state.since)}. Showing last good data from ${ago(state.lastGood)}.`
              : `Can't reach the data server — showing data saved on this device ${ago(state.lastGood)}.`;

    return (
        <div
            role={state.kind === "upstream-down" ? "alert" : "status"}
            className={cn("px-4 py-2 text-center text-sm font-medium sticky top-0 z-40 backdrop-blur-sm", tone)}
        >
            {message}
        </div>
    );
}
