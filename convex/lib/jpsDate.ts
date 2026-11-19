/**
 * Converts a JPS timestamp ("21/08/2025 21:15:00", Malaysia time, UTC+8) to
 * an ISO string in UTC.
 *
 * Returns "" when the input is missing or malformed. An unknown age must read
 * as stale, never as fresh: the staleness gate treats "" as unknown, so the
 * reading is stored as -1 and cannot page subscribers (#100).
 *
 * Uses Date.UTC so the result does not depend on the runtime's timezone.
 */
export function convertJpsDateToIso(jpsDate: string | null | undefined): string {
    if (!jpsDate) return "";

    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/.exec(jpsDate.trim());
    if (!match) return "";

    const [, day, month, year, hour, minute, second] = match.map(Number);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
        return "";
    }

    const utcMs = Date.UTC(year, month - 1, day, hour - 8, minute, second);
    const date = new Date(utcMs);
    // Reject rollovers such as 31/02 becoming 3 March.
    const local = new Date(utcMs + 8 * 60 * 60 * 1000);
    if (local.getUTCDate() !== day || local.getUTCMonth() !== month - 1) return "";

    return date.toISOString();
}
