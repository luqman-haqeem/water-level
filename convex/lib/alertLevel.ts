/**
 * Alert classification. Pure — no Convex imports — so it is unit-testable and
 * portable to the Cloudflare Worker (see the Phase 1 module list in #67).
 *
 * The rule this module exists to enforce: **when we do not know, we say we do
 * not know.** Previously classification failed unsafe in both directions (#73):
 * a station with no thresholds classified as DANGER, and an upstream status we
 * did not recognise was reported to users as Normal. On a flood-warning app the
 * first spends the alert budget on noise and the second is the worst possible
 * failure — telling someone a river is fine when we have no idea.
 */

export const ALERT_LEVEL = {
    /** No reading, no usable thresholds, or an upstream status we don't recognise. */
    unknown: -1,
    normal: 0,
    alert: 1,
    warning: 2,
    danger: 3,
} as const;

export interface StationThresholds {
    normalLevel?: number;
    alertLevel?: number;
    warningLevel?: number;
    dangerLevel?: number;
}

/**
 * Normalises a JPS threshold to a usable number, or `undefined` if absent.
 *
 * Treats `0` and negatives as absent. JPS uses `0` for "not configured" and
 * `-9999` as a null sentinel, and a real river threshold is never at or below
 * zero metres. This is the same sentinel-aware treatment `parseCoordinate` in
 * sync/stationUpdater.ts applies to lat/lng, and for the same reason: the old
 * `wlth_danger || 0` collapsed "absent" and "zero" into a single value, after
 * which `currentWaterLevel >= dangerLevel` was true for any reading at all.
 */
export function parseThreshold(raw: unknown): number | undefined {
    const parsed =
        typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) : NaN;

    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Classifies a reading against thresholds, comparing only against thresholds
 * that actually exist.
 *
 * Returns `unknown` when none of alert/warning/danger is known: without any of
 * them a reading carries no safety meaning, and guessing in either direction is
 * worse than admitting the gap.
 */
export function classifyByThresholds(
    currentWaterLevel: number,
    thresholds: StationThresholds
): number {
    const { alertLevel, warningLevel, dangerLevel } = thresholds;

    if (alertLevel === undefined && warningLevel === undefined && dangerLevel === undefined) {
        return ALERT_LEVEL.unknown;
    }

    if (dangerLevel !== undefined && currentWaterLevel >= dangerLevel) return ALERT_LEVEL.danger;
    if (warningLevel !== undefined && currentWaterLevel >= warningLevel) return ALERT_LEVEL.warning;
    if (alertLevel !== undefined && currentWaterLevel >= alertLevel) return ALERT_LEVEL.alert;

    return ALERT_LEVEL.normal;
}

/**
 * Determines the alert level from JPS's `waterlevelStatus`, falling back to
 * threshold comparison when JPS reports -1 ("below normal").
 */
export function computeAlertLevel(
    station: {
        currentWaterLevel: number | null;
        waterlevelStatus: number | null | undefined;
    } & StationThresholds
): number {
    if (station.currentWaterLevel === null) return ALERT_LEVEL.unknown;

    switch (station.waterlevelStatus) {
        case ALERT_LEVEL.danger:
            return ALERT_LEVEL.danger;
        case ALERT_LEVEL.warning:
            return ALERT_LEVEL.warning;
        case ALERT_LEVEL.alert:
            return ALERT_LEVEL.alert;
        case ALERT_LEVEL.normal:
            return ALERT_LEVEL.normal;
        case -1:
            return classifyByThresholds(station.currentWaterLevel, station);
        default:
            // Was `return 0`, i.e. "anything we don't recognise is Normal".
            return ALERT_LEVEL.unknown;
    }
}
