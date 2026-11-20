const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;

// "DD/MM/YYYY HH:mm:ss" — used by JPS station records (lastUpdate); day, month
// and hour are sometimes emitted unpadded ("1/8/2025 9:05:00")
const LEGACY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/;
// "YYYY-MM-DDTHH:mm[:ss]" or "YYYY-MM-DD HH:mm[:ss]" without a zone — used by
// JPS district summaries (allLastUpdated); wall-clock time in Asia/Kuala_Lumpur
const LOCAL_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
// Anything ending in Z or ±HH:mm carries its own zone
const ZONED_RE = /(?:Z|[+-]\d{2}:\d{2})$/i;

function parseJpsDateToUtcMs(jpsDate: string): number | null {
    const local = LOCAL_ISO_RE.exec(jpsDate);
    if (local) {
        const [, year, month, day, hour, minute, second] = local;
        return (
            Date.UTC(+year, +month - 1, +day, +hour, +minute, second ? +second : 0) -
            MALAYSIA_OFFSET_MS
        );
    }

    const legacy = LEGACY_RE.exec(jpsDate);
    if (legacy) {
        const [, day, month, year, hour, minute, second] = legacy;
        return Date.UTC(+year, +month - 1, +day, +hour, +minute, +second) - MALAYSIA_OFFSET_MS;
    }

    if (ZONED_RE.test(jpsDate)) {
        const ms = Date.parse(jpsDate);
        return Number.isNaN(ms) ? null : ms;
    }

    return null;
}

/**
 * Converts a JPS timestamp to a UTC ISO string. JPS emits two zone-less
 * formats, both meaning Malaysian local time (UTC+8): "DD/MM/YYYY HH:mm:ss"
 * (station lastUpdate) and "YYYY-MM-DDTHH:mm:ss" (district allLastUpdated).
 * Zoned ISO strings are honoured as-is. Falls back to "now" for unparseable input.
 */
export function convertJpsDateToIso(jpsDate: string): string {
    if (!jpsDate) return new Date().toISOString();

    const utcMs = parseJpsDateToUtcMs(jpsDate.trim());
    if (utcMs === null || Number.isNaN(utcMs)) {
        console.warn(`Failed to convert JPS date "${jpsDate}"`);
        return new Date().toISOString();
    }
    return new Date(utcMs).toISOString();
}
