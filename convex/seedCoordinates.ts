import { internalMutation, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const patchStationCoordinates = internalMutation({
    args: {
        stations: v.array(v.object({
            jpsSelId: v.string(),
            latitude: v.number(),
            longitude: v.number(),
        })),
    },
    handler: async (ctx, { stations }) => {
        let updated = 0;
        let notFound = 0;

        for (const station of stations) {
            const existing = await ctx.db
                .query("stations")
                .withIndex("by_jps_sel_id", (q) => q.eq("jpsSelId", station.jpsSelId))
                .first();

            if (existing) {
                await ctx.db.patch(existing._id, {
                    latitude: station.latitude,
                    longitude: station.longitude,
                });
                updated++;
            } else {
                notFound++;
            }
        }

        console.log(`✅ Coordinate seed complete: ${updated} updated, ${notFound} not found`);
        return { updated, notFound };
    },
});

export const seedCoordinatesFromApi = action({
    handler: async (ctx): Promise<{ fetched: number; updated: number; notFound: number }> => {
        const response = await fetch(
            "https://infobanjirjps.selangor.gov.my/JPSAPI/api/StationRiverLevels"
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch: HTTP ${response.status}`);
        }

        const data = await response.json();

        const stations: { jpsSelId: string; latitude: number; longitude: number }[] = data
            .filter((s: any) => s.latitude && s.longitude && s.stationId)
            .map((s: any) => ({
                jpsSelId: s.stationId.toString(),
                latitude: parseFloat(s.latitude),
                longitude: parseFloat(s.longitude),
            }))
            .filter((s: { latitude: number; longitude: number }) => !isNaN(s.latitude) && !isNaN(s.longitude) && s.latitude !== 0 && s.longitude !== 0);

        console.log(`📍 Fetched ${stations.length} stations with coordinates from JPS API`);

        const result: { updated: number; notFound: number } = await ctx.runMutation(
            internal.seedCoordinates.patchStationCoordinates,
            { stations }
        );

        return {
            fetched: stations.length,
            ...result,
        };
    },
});
