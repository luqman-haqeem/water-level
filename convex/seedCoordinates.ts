import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// 81 stations with coordinates sourced from JPS /StationRiverLevels endpoint (Aug 2025)
const STATION_COORDINATES: { jpsSelId: string; latitude: number; longitude: number }[] = [
    { jpsSelId: "153", latitude: 3.037984, longitude: 101.534493 },
    { jpsSelId: "156", latitude: 3.097129, longitude: 101.553794 },
    { jpsSelId: "157", latitude: 3.048146, longitude: 101.444989 },
    { jpsSelId: "160", latitude: 3.2378249, longitude: 101.4772257 },
    { jpsSelId: "158", latitude: 3.333427, longitude: 101.258929 },
    { jpsSelId: "161", latitude: 3.401811, longitude: 101.441718 },
    { jpsSelId: "162", latitude: 3.368277, longitude: 101.606848 },
    { jpsSelId: "163", latitude: 3.093398, longitude: 101.797773 },
    { jpsSelId: "165", latitude: 3.460316, longitude: 101.637266 },
    { jpsSelId: "167", latitude: 3.469847, longitude: 101.639724 },
    { jpsSelId: "168", latitude: 3.5403, longitude: 101.663213 },
    { jpsSelId: "170", latitude: 3.588404, longitude: 101.606435 },
    { jpsSelId: "172", latitude: 3.173792, longitude: 101.869143 },
    { jpsSelId: "174", latitude: 2.992715, longitude: 101.785515 },
    { jpsSelId: "176", latitude: 2.854434, longitude: 101.6812 },
    { jpsSelId: "179", latitude: 3.075663, longitude: 101.553833 },
    { jpsSelId: "188", latitude: 3.003528, longitude: 101.7884965 },
    { jpsSelId: "189", latitude: 2.997946, longitude: 101.809367 },
    { jpsSelId: "190", latitude: 2.965217, longitude: 101.785372 },
    { jpsSelId: "192", latitude: 3.150049, longitude: 101.540929 },
    { jpsSelId: "193", latitude: 3.112236, longitude: 101.596445 },
    { jpsSelId: "200", latitude: 3.076472, longitude: 101.621389 },
    { jpsSelId: "199", latitude: 3.096911, longitude: 101.634582 },
    { jpsSelId: "202", latitude: 3.677919, longitude: 101.520611 },
    { jpsSelId: "201", latitude: 3.804499, longitude: 101.361768 },
    { jpsSelId: "203", latitude: 3.304813, longitude: 101.592064 },
    { jpsSelId: "205", latitude: 2.813436, longitude: 101.641879 },
    { jpsSelId: "204", latitude: 3.014497, longitude: 101.71873 },
    { jpsSelId: "206", latitude: 2.788596, longitude: 101.741922 },
    { jpsSelId: "213", latitude: 3.136456, longitude: 101.438946 },
    { jpsSelId: "216", latitude: 3.019196, longitude: 101.376438 },
    { jpsSelId: "217", latitude: 3.366076, longitude: 101.346635 },
    { jpsSelId: "222", latitude: 3.196498, longitude: 101.548909 },
    { jpsSelId: "219", latitude: 3.297236, longitude: 101.378453 },
    { jpsSelId: "224", latitude: 2.826924, longitude: 101.543898 },
    { jpsSelId: "225", latitude: 2.685098, longitude: 101.535993 },
    { jpsSelId: "226", latitude: 2.896052, longitude: 101.77484 },
    { jpsSelId: "228", latitude: 3.059147, longitude: 101.480104 },
    { jpsSelId: "230", latitude: 3.194293, longitude: 101.855267 },
    { jpsSelId: "232", latitude: 3.484723, longitude: 101.537076 },
    { jpsSelId: "235", latitude: 3.136895, longitude: 101.834712 },
    { jpsSelId: "236", latitude: 3.194293, longitude: 101.855267 },
    { jpsSelId: "237", latitude: 3.147313, longitude: 101.789671 },
    { jpsSelId: "238", latitude: 3.322987, longitude: 101.525649 },
    { jpsSelId: "239", latitude: 3.392759, longitude: 101.533658 },
    { jpsSelId: "240", latitude: 3.738606, longitude: 101.445829 },
    { jpsSelId: "241", latitude: 2.958786, longitude: 101.849421 },
    { jpsSelId: "242", latitude: 3.261057, longitude: 101.526892 },
    { jpsSelId: "248", latitude: 3.027667, longitude: 101.748778 },
    { jpsSelId: "250", latitude: 3.428279, longitude: 101.176409 },
    { jpsSelId: "253", latitude: 3.363235, longitude: 101.239092 },
    { jpsSelId: "254", latitude: 3.267279, longitude: 101.726657 },
    { jpsSelId: "255", latitude: 3.31749, longitude: 101.571222 },
    { jpsSelId: "261", latitude: 3.000872, longitude: 101.420448 },
    { jpsSelId: "260", latitude: 2.896966, longitude: 101.72834 },
    { jpsSelId: "262", latitude: 2.863142, longitude: 101.445427 },
    { jpsSelId: "274", latitude: 3.021509, longitude: 101.524216 },
    { jpsSelId: "286", latitude: 2.969105, longitude: 101.639443 },
    { jpsSelId: "287", latitude: 2.778193, longitude: 101.754678 },
    { jpsSelId: "831", latitude: 2.939051, longitude: 101.422061 },
    { jpsSelId: "832", latitude: 2.872754, longitude: 101.72026 },
    { jpsSelId: "833", latitude: 3.709434, longitude: 101.174928 },
    { jpsSelId: "841", latitude: 3.155253, longitude: 101.472838 },
    { jpsSelId: "845", latitude: 3.236268, longitude: 101.68027 },
    { jpsSelId: "847", latitude: 3.049139, longitude: 101.41316 },
    { jpsSelId: "850", latitude: 3.214124, longitude: 101.767619 },
    { jpsSelId: "851", latitude: 2.878951, longitude: 101.871569 },
    { jpsSelId: "852", latitude: 3.107821, longitude: 101.355571 },
    { jpsSelId: "871", latitude: 3.071861, longitude: 101.646556 },
    { jpsSelId: "875", latitude: 3.212731, longitude: 101.50708 },
    { jpsSelId: "876", latitude: 3.411906, longitude: 101.166955 },
    { jpsSelId: "877", latitude: 3.385003, longitude: 101.299811 },
    { jpsSelId: "878", latitude: 3.197979, longitude: 101.400665 },
    { jpsSelId: "890", latitude: 3.0013386, longitude: 101.5193508 },
    { jpsSelId: "891", latitude: 2.9793929, longitude: 101.4692713 },
    { jpsSelId: "893", latitude: 3.0000694, longitude: 101.4110519 },
    { jpsSelId: "1173", latitude: 3.300469, longitude: 101.387881 },
    { jpsSelId: "1174", latitude: 3.134538, longitude: 101.371654 },
    { jpsSelId: "1175", latitude: 2.916538, longitude: 101.321212 },
    { jpsSelId: "1176", latitude: 3.005173, longitude: 101.462632 },
    { jpsSelId: "1179", latitude: 3.713186, longitude: 101.225621 },
];

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

/**
 * One-time mutation to seed station coordinates from hardcoded JPS data.
 *
 * HOW TO RUN (internal — not callable from the public API):
 *   npx convex run seedCoordinates:seedCoordinatesFromHardcoded
 * or Convex Dashboard → Functions → seedCoordinates → seedCoordinatesFromHardcoded → Run
 *
 * Safe to run multiple times — idempotent (just re-patches same values).
 */
export const seedCoordinatesFromHardcoded = internalMutation({
    handler: async (ctx): Promise<{ total: number; updated: number; notFound: number }> => {
        const result = await ctx.runMutation(
            internal.seedCoordinates.patchStationCoordinates,
            { stations: STATION_COORDINATES }
        );

        return {
            total: STATION_COORDINATES.length,
            ...result,
        };
    },
});
