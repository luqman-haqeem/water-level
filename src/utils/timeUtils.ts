import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(relativeTime)

// Helper function to format timestamp in KL time
const formatTimestamp = (timestamp: string) => {
    return dayjs.utc(timestamp).tz('Asia/Kuala_Lumpur').fromNow()
}

/** 45 minutes = 3 missed 15-min sync cycles */
export const STALENESS_THRESHOLD_MS = 2_700_000

/**
 * Returns true when a station reading is stale (older than 45 minutes)
 * or when updatedAt is undefined/missing.
 */
export function isStale(updatedAt: string | number | undefined): boolean {
    if (updatedAt === undefined || updatedAt === null) return true
    const at = new Date(updatedAt).getTime()
    // An unparseable or empty time is unknown age, which must read as stale (#100);
    // NaN compares false, so without this it read as fresh.
    if (Number.isNaN(at)) return true
    return Date.now() - at > STALENESS_THRESHOLD_MS
}

export default formatTimestamp