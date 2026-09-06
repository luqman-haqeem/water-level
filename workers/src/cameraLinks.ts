/**
 * Which water level station each CCTV camera watches, in JPS ids:
 * `{ jps_camera_id: jps_station_id }`.
 *
 * Static because JPS publishes no such link. The camera endpoint returns only
 * id, name, brand, image URL and online flags, so this association was curated
 * by hand and lived in `cameras.stationId` in the database. It is exported
 * here in JPS terms — the Convex ids it used to hold do not survive the
 * migration, and both duplicate station documents shared one `jpsSelId`, so
 * translating through that key resolves the duplicates automatically.
 *
 * Extracted from the production `cameras` table on 2026-09-06: 37 of 93
 * cameras carry a link, all 37 resolved to a JPS station with no dangling
 * references, covering 37 distinct stations.
 *
 * Cameras absent from this map still mirror on the normal rotation; they just
 * cannot be prioritised when their river rises. Adding a pair here is the only
 * step needed to promote one.
 */
export const CAMERA_STATION_LINKS: Record<string, string> = {
    "1": "167",
    "3": "242",
    "4": "235",
    "7": "176",
    "8": "206",
    "9": "205",
    "13": "192",
    "15": "156",
    "17": "157",
    "18": "228",
    "19": "163",
    "20": "890",
    "21": "193",
    "25": "161",
    "26": "201",
    "27": "202",
    "31": "248",
    "34": "232",
    "36": "239",
    "37": "174",
    "233": "213",
    "234": "1173",
    "235": "199",
    "236": "286",
    "245": "841",
    "1254": "891",
    "1255": "230",
    "1265": "217",
    "1267": "160",
    "1273": "226",
    "1275": "875",
    "1277": "274",
    "1278": "222",
    "1280": "172",
    "1283": "260",
    "1288": "250",
    "1289": "833"
};

/** Cameras watching any of the given stations. */
export function camerasForStations(stationIds: Iterable<string>): Set<string> {
    const wanted = new Set(stationIds);
    const out = new Set<string>();
    for (const [cameraId, stationId] of Object.entries(CAMERA_STATION_LINKS)) {
        if (wanted.has(stationId)) out.add(cameraId);
    }
    return out;
}
