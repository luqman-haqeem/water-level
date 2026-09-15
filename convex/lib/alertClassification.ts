/**
 * Alert classification — the single place where a JPS reading becomes an
 * alert level. Pure functions only, so they can be unit tested without a
 * Convex runtime (see `convex/__tests__/alertClassification.test.ts`).
 *
 * Levels: 0=normal, 1=alert, 2=warning, 3=danger, -1=unknown.
 *
 * The guiding rule is that this must fail *safe*: when we cannot classify a
 * reading with confidence we say "unknown", never "normal" (which claims
 * safety we have not verified) and never "danger" (which pages subscribers).
 */

/** Sentinel for "we cannot classify this reading". */
export const ALERT_UNKNOWN = -1;

/**
 * 45 minutes = 3 missed 15-minute sync cycles.
 *
 * NOTE: must stay in sync with `STALENESS_THRESHOLD_MS` in
 * `src/utils/timeUtils.ts`. The Convex backend and the Vite frontend cannot
 * share modules, so the constant is duplicated by necessity.
 */
export const STALENESS_THRESHOLD_MS = 2_700_000;

export interface AlertClassificationInput {
    currentWaterLevel: number | null;
    alertLevel: number;
    warningLevel: number;
    dangerLevel: number;
    waterlevelStatus: number;
    normalLevel?: number;
}

export type ThresholdInput = Pick<
    AlertClassificationInput,
    "alertLevel" | "warningLevel" | "dangerLevel"
>;

function isPositiveFinite(value: number): boolean {
    return Number.isFinite(value) && value > 0;
}

/**
 * True when the three thresholds can be trusted to classify a reading.
 *
 * The upstream scraper coalesces absent thresholds with `|| 0`
 * (`convex/sync/waterLevelUpdater.ts`), so a station JPS has not configured
 * arrives here as `0`. Comparing a reading against a zero danger threshold
 * makes almost any reading "danger", which is why zero is rejected rather
 * than treated as a real level.
 */
export function hasUsableThresholds(thresholds: ThresholdInput): boolean {
    const { alertLevel, warningLevel, dangerLevel } = thresholds;

    if (
        !isPositiveFinite(alertLevel) ||
        !isPositiveFinite(warningLevel) ||
        !isPositiveFinite(dangerLevel)
    ) {
        return false;
    }

    // Thresholds must ascend (equal adjacent values are tolerated — some
    // stations genuinely share a warning/danger mark).
    return alertLevel <= warningLevel && warningLevel <= dangerLevel;
}

/**
 * Classifies a reading into an alert level, or `ALERT_UNKNOWN` when it cannot
 * be classified safely.
 *
 * Trusts the upstream `waterlevelStatus` when it is one of the four known
 * codes. Falls back to threshold comparison only for `-1` ("below normal"),
 * and only when the thresholds are usable.
 */
export function computeAlertLevel(station: AlertClassificationInput): number {
    const { currentWaterLevel, waterlevelStatus } = station;

    if (currentWaterLevel === null || !Number.isFinite(currentWaterLevel)) {
        return ALERT_UNKNOWN;
    }

    if (!Number.isFinite(waterlevelStatus)) return ALERT_UNKNOWN;

    switch (waterlevelStatus) {
        case 3:
            return 3; // danger
        case 2:
            return 2; // warning
        case 1:
            return 1; // alert
        case 0:
            return 0; // normal
        case -1: {
            // Below normal per upstream — derive the level from thresholds.
            if (!hasUsableThresholds(station)) return ALERT_UNKNOWN;
            if (currentWaterLevel >= station.dangerLevel) return 3;
            if (currentWaterLevel >= station.warningLevel) return 2;
            if (currentWaterLevel >= station.alertLevel) return 1;
            return 0;
        }
        default:
            // An upstream code we do not recognise. Reporting "normal" here
            // would tell users a station is safe on the strength of a value
            // we cannot interpret.
            return ALERT_UNKNOWN;
    }
}

/**
 * Downgrades a classification to unknown once its reading is too old to stand
 * behind, so a stale record cannot keep a non-Normal level in the database.
 *
 * A stale *Normal* is downgraded too: an old reading is not evidence of
 * present safety.
 */
export function applyStalenessGate(
    alertLevel: number,
    updatedAt: string | undefined,
    now: number = Date.now()
): number {
    if (alertLevel === ALERT_UNKNOWN) return ALERT_UNKNOWN;
    if (!updatedAt) return ALERT_UNKNOWN;

    const readingAt = new Date(updatedAt).getTime();
    if (!Number.isFinite(readingAt)) return ALERT_UNKNOWN;

    return now - readingAt > STALENESS_THRESHOLD_MS ? ALERT_UNKNOWN : alertLevel;
}
