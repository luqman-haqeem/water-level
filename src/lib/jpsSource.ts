/**
 * The official upstream source for every reading in the app. Keep the
 * portal in step with the sync host in convex/lib/jpsClient.ts.
 */
export const JPS_SELANGOR_PORTAL_URL = "https://infobanjirjps.selangor.gov.my/";

/** JPS Selangor flood operations room (Bilik Gerakan Banjir). */
export const JPS_FLOOD_OPS_PHONES = [
    { display: "03-5544 7378", tel: "+60355447378" },
    { display: "03-5544 7010", tel: "+60355447010" },
] as const;
