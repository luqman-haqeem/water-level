import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

export type SnapshotFileName = "stations" | "cameras" | "trends" | "meta";

export interface SnapshotEnvelope<T> {
    generatedAt: string;
    items: T;
}

/** Exactly the Convex query shapes — the publisher serialises these queries verbatim. */
export type SnapshotStation = FunctionReturnType<typeof api.stations.getStationsWithDetails>[number];
export type SnapshotCamera = FunctionReturnType<typeof api.cameras.getCamerasWithDetails>[number];

export interface TrendPoint {
    timestamp: number;
    currentLevel: number;
    alertLevel: number;
    recordedAt: string;
}

export type SyncStatus = "ok" | "upstream_error";

export interface SnapshotMeta {
    syncedAt: string | null;
    attemptedAt: string;
    jpsLastUpdate: string | null;
    status: SyncStatus;
    failingSince?: string;
    error?: string;
}

export type StationsSnapshot = SnapshotEnvelope<SnapshotStation[]>;
export type CamerasSnapshot = SnapshotEnvelope<SnapshotCamera[]>;
export type TrendsSnapshot = SnapshotEnvelope<Record<string, TrendPoint[]>>;
