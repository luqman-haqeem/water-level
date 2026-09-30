import { internalMutation } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";

/**
 * One-off merge of duplicate `stations` rows (same `jpsSelId`).
 *
 * The duplicates date from when `jpsSelId` was written as a number by one sync
 * path and a string by another: the index lookup never matched, so each sync
 * inserted a fresh row, and the later string migration turned those into exact
 * duplicates. The sync only ever updates the first match, so the others show
 * in the app with frozen or missing readings.
 *
 * New duplicates can no longer appear — `jpsSelId` is `v.string()` and the
 * lookup-then-insert runs inside one transactional mutation — so this is a
 * one-off. It is idempotent: a second run finds no groups.
 *
 * Run with `{ dryRun: true }` first; it reports the plan without writing.
 */

// Station fields a keeper may inherit from a duplicate when it has none itself.
const INHERITABLE = [
    "publicInfoId",
    "stationCode",
    "refName",
    "latitude",
    "longitude",
    "gsmNumber",
    "normalWaterLevel",
    "alertWaterLevel",
    "warningWaterLevel",
    "dangerWaterLevel",
    "mode",
    "z1",
    "z2",
    "z3",
    "batteryLevel",
] as const;

type StationRow = { _id: string; _creationTime: number; jpsSelId: string } & Partial<
    Pick<Doc<"stations">, (typeof INHERITABLE)[number] | "mergedStationIds">
> &
    Record<string, unknown>;

const hasCoordinates = (row: StationRow) =>
    row.latitude !== undefined && row.longitude !== undefined;

/**
 * Picks the surviving row — the one with coordinates, else the oldest — and the
 * patch that fills its missing fields from the duplicates without overwriting.
 */
export function planStationMerge<T extends StationRow>(rows: T[]) {
    if (new Set(rows.map((row) => row.jpsSelId)).size !== 1) {
        throw new Error("planStationMerge: rows must share the same jpsSelId");
    }

    const [keeper, ...losers] = [...rows].sort(
        (a, b) =>
            Number(hasCoordinates(b)) - Number(hasCoordinates(a)) ||
            a._creationTime - b._creationTime
    );

    const patch: Record<string, unknown> = {};
    for (const field of INHERITABLE) {
        if (keeper[field] !== undefined) continue;
        const donor = losers.find((row) => row[field] !== undefined);
        if (donor) patch[field] = donor[field];
    }
    patch.mergedStationIds = [
        ...(keeper.mergedStationIds ?? []),
        ...losers.flatMap((row) => [row._id, ...(row.mergedStationIds ?? [])]),
    ];

    return { keeper, losers, patch };
}

/** The current-level row to keep: newest reading, else newest row. */
export function pickLatestLevel<T extends { _creationTime: number; updatedAt?: string }>(
    levels: T[]
): T | undefined {
    const time = (level: T) =>
        level.updatedAt ? Date.parse(level.updatedAt) : Number.NEGATIVE_INFINITY;
    return [...levels].sort(
        (a, b) => time(b) - time(a) || b._creationTime - a._creationTime
    )[0];
}

export const dedupeStations = internalMutation({
    args: { dryRun: v.boolean() },
    handler: async (ctx, { dryRun }) => {
        const stations = await ctx.db.query("stations").collect();

        const groups = new Map<string, Doc<"stations">[]>();
        for (const station of stations) {
            groups.set(station.jpsSelId, [...(groups.get(station.jpsSelId) ?? []), station]);
        }

        const merges = [];
        const moved = { currentLevels: 0, history: 0, cameras: 0, notificationLog: 0 };

        for (const rows of groups.values()) {
            if (rows.length < 2) continue;
            const { keeper, losers, patch } = planStationMerge(rows);
            const keeperId = keeper._id;
            const stationIds = [keeperId, ...losers.map((row) => row._id)];

            merges.push({
                jpsSelId: keeper.jpsSelId,
                stationName: keeper.stationName,
                keep: keeperId,
                remove: losers.map((row) => row._id),
                inherits: Object.keys(patch).filter((key) => key !== "mergedStationIds"),
            });
            if (dryRun) continue;

            // Current level: exactly one per station — keep the freshest.
            const levels = (
                await Promise.all(
                    stationIds.map((stationId) =>
                        ctx.db
                            .query("currentLevels")
                            .withIndex("by_station", (q) => q.eq("stationId", stationId))
                            .collect()
                    )
                )
            ).flat();
            const latest = pickLatestLevel(levels);
            for (const level of levels) {
                if (level._id !== latest?._id) {
                    await ctx.db.delete(level._id);
                } else if (level.stationId !== keeperId) {
                    await ctx.db.patch(level._id, { stationId: keeperId });
                    moved.currentLevels++;
                }
            }

            for (const loser of losers) {
                const loserId: Id<"stations"> = loser._id;

                for (const row of await ctx.db
                    .query("waterLevelHistory")
                    .withIndex("by_station", (q) => q.eq("stationId", loserId))
                    .collect()) {
                    await ctx.db.patch(row._id, { stationId: keeperId });
                    moved.history++;
                }
                for (const row of await ctx.db
                    .query("cameras")
                    .withIndex("by_station", (q) => q.eq("stationId", loserId))
                    .collect()) {
                    await ctx.db.patch(row._id, { stationId: keeperId });
                    moved.cameras++;
                }
                for (const row of await ctx.db
                    .query("notificationLog")
                    .withIndex("by_station", (q) => q.eq("stationId", loserId))
                    .collect()) {
                    await ctx.db.patch(row._id, { stationId: keeperId });
                    moved.notificationLog++;
                }

                await ctx.db.delete(loserId);
            }

            await ctx.db.patch(keeperId, patch);
        }

        const summary = {
            dryRun,
            stationsBefore: stations.length,
            duplicateGroups: merges.length,
            rowsRemoved: merges.reduce((sum, merge) => sum + merge.remove.length, 0),
            moved,
        };
        return { ...summary, merges };
    },
});
