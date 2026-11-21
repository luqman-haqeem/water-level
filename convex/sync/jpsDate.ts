const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;

// "DD/MM/YYYY HH:mm:ss" — used by JPS station records (lastUpdate); day, month
// and hour are sometimes emitted unpadded ("1/8/2025 9:05:00")
const LEGACY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/;
// "YYYY-MM-DDTHH:mm[:ss]" or "YYYY-MM-DD HH:mm[:ss]" without a zone — used by
// JPS district summaries (allLastUpdated); wall-clock time in Asia/Kuala_Lumpur
const LOCAL_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
// Anything ending in Z or ±HH:mm carries its own zone
const ZONED_RE = /(?:Z|[+-]\d{2}:\d{2})$/i;

/** Local wall-clock parts → UTC ms, or null if any part is out of range (31/02 must
 *  not silently roll over to 3 March). */
function localToUtcMs(y: number, mo: number, d: number, h: number, mi: number, s: number): number | null {
    if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
    const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
    const check = new Date(asUtc);
    if (check.getUTCDate() !== d || check.getUTCMonth() !== mo - 1) return null;
    return asUtc - MALAYSIA_OFFSET_MS;
}

function parseJpsDateToUtcMs(jpsDate: string): number | null {
    const local = LOCAL_ISO_RE.exec(jpsDate);
    if (local) {
        const [, year, month, day, hour, minute, second] = local;
        return localToUtcMs(+year, +month, +day, +hour, +minute, second ? +second : 0);
    }

    const legacy = LEGACY_RE.exec(jpsDate);
    if (legacy) {
        const [, day, month, year, hour, minute, second] = legacy;
        return localToUtcMs(+year, +month, +day, +hour, +minute, +second);
    }

    if (ZONED_RE.test(jpsDate)) {
        const ms = Date.parse(jpsDate);
        return Number.isNaN(ms) ? null : ms;
    }

    return null;
}

/**
 * Converts a JPS timestamp to a UTC ISO string, or null when it is missing or
 * unparseable. JPS emits two zone-less formats, both meaning Malaysian local time
 * (UTC+8): "DD/MM/YYYY HH:mm:ss" (station lastUpdate) and "YYYY-MM-DDTHH:mm:ss"
 * (district allLastUpdated). Zoned ISO strings are honoured as-is.
 *
 * Use this for readings: a reading of unknown age must read as stale, never as
 * fresh (#100).
 */
export function parseJpsDateToIso(jpsDate: string | null | undefined): string | null {
    if (!jpsDate) return null;
    const utcMs = parseJpsDateToUtcMs(jpsDate.trim());
    if (utcMs === null || Number.isNaN(utcMs)) {
        console.warn(`Failed to convert JPS date "${jpsDate}"`);
        return null;
    }
    return new Date(utcMs).toISOString();
}

/**
 * As `parseJpsDateToIso`, but falls back to "now" for unparseable input.
 *
 * Only for change detection over district stamps, where "now" just forces a
 * re-fetch. Never for a reading's time: there "now" makes unknown-age data look
 * fresh, which is what #100 fixed.
 */
export function convertJpsDateToIso(jpsDate: string): string {
    return parseJpsDateToIso(jpsDate) ?? new Date().toISOString();
}
