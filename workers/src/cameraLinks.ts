/**
 * Which water level station each CCTV camera watches, in JPS ids:
 * \`{ jps_camera_id: jps_station_id }\`.
 *
 * Curated by hand by the repository owner. JPS publishes nothing connecting the two —
 * its camera endpoint returns only id, name, brand, image URL and online flags — so
 * this cannot be derived. Matching cameras to their nearest station by coordinates was
 * tried and rejected: it disagreed with the curated list 8 times out of 36, and in
 * every disagreement the names matched exactly while the coordinates differed by up to
 * 109 km. JPS coordinate data is not reliable enough for this.
 *
 * Originally exported from the production Convex \`cameras.stationId\` column on
 * 2026-09-06 and translated into JPS ids, which also resolved the duplicate station
 * documents, since both twins shared one \`jpsSelId\`.
 *
 * **One camera per station.** A station renders a single camera, so a second entry
 * pointing at the same station would silently displace the first rather than add to it.
 * Enforced by test.
 *
 * Cameras absent from this map still mirror on the normal rotation; they just cannot be
 * prioritised when their river rises, and they do not appear on a station page. Adding
 * one is a single line — the trailing comment is what makes it reviewable.
 */
export const CAMERA_STATION_LINKS: Record<string, string> = {
    // ---- GOMBAK ----
    "3": "242",      // Kg. Melayu Sri Kundang    ->  KG. MELAYU SERI KUNDANG

    // ---- HULU LANGAT ----
    "4": "235",      // Bt. 15 (I.K.B.N)          ->  BATU 15, HULU LANGAT
    "19": "163",     // Bt. 12 Sg.Serai           ->  BATU 12, HULU LANGAT
    "31": "248",     // Kg. Baru Balakong         ->  KG. BARU BALAKONG
    "37": "174",     // Pekan Kajang              ->  PEKAN KAJANG
    "1255": "230",   // Batu 9                    ->  BATU 9, HULU LANGAT
    "1273": "226",   // Bangi Lama                ->  PEKAN BANGI LAMA
    "1280": "172",   // Sg Lui                    ->  KG. SG. LUI

    // ---- HULU SELANGOR ----
    "1": "167",      // Pekan Batang Kali         ->  BATANG KALI
    "26": "201",     // Jambatan S.K.C            ->  JAMBATAN S.K.C
    "27": "202",     // Tanjung Malim             ->  TANJUNG MALIM
    "34": "232",     // Kg. Timah Bkt. Beruntung  ->  KG. TIMAH, BUKIT BERUNTUNG
    "36": "239",     // Kg. Sg. Buaya             ->  KG. SG. BUAYA

    // ---- KLANG ----
    "17": "157",     // Bandar Klang              ->  BANDAR KLANG
    "18": "228",     // Tugu Keris                ->  TUGU KERIS, KLANG
    "20": "890",     // Kg. Bukit Rimau           ->  BUKIT RIMAU
    "233": "213",    // Pekan Meru                ->  PEKAN MERU
    "1254": "891",   // Johan Setia               ->  KG. JOHAN SETIA
    "1277": "274",   // Taman Desa Kemuning       ->  TAMAN DESA KEMUNING

    // ---- KUALA LANGAT ----
    "9": "205",      // Bukit Changgang           ->  BUKIT CHANGGANG

    // ---- KUALA SELANGOR ----
    "25": "161",     // Rantau Panjang            ->  RANTAU PANJANG
    "234": "1173",   // PA Ijok Compartment D     ->  PINTU AIR IJOK
    "1265": "217",   // Kampung Asahan            ->  KG. ASAHAN
    "1267": "160",   // Saujana Aman              ->  SAUJANA AMAN
    "1288": "250",   // Pekan Tanjung Karang      ->  P/A PEKAN TG. KARANG

    // ---- PETALING ----
    "13": "192",     // Kg. Melayu Subang         ->  KG. MELAYU SUBANG
    "15": "156",     // TTDI Jaya, Shah Alam      ->  T.T.D.I JAYA, SHAH ALAM
    "21": "193",     // Taman Mayang              ->  TAMAN MAYANG
    "235": "199",    // Jalan 222                 ->  JALAN 222
    "245": "841",    // Kg Budiman                ->  KG BUDIMAN
    "1275": "875",   // Merbau Sempak             ->  MERBAU SEMPAK
    "1278": "222",   // Paya Jaras                ->  PAYA JARAS, SG. BULOH

    // ---- SABAK BERNAM ----
    "1289": "833",   // Rimba KDR                 ->  RIMBA KDR

    // ---- SEPANG ----
    "7": "176",      // Pekan Dengkil             ->  DENGKIL
    "8": "206",      // Kg. Salak Tinggi          ->  KG. SALAK TINGGI
    "236": "286",    // Pulau Meranti             ->  PULAU MERANTI
    "1283": "260",   // Jenderam Hilir            ->  JENDERAM HILIR
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
