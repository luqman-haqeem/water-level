/**
 * Alert classification for a single JPS reading.
 *
 * Levels: -1 = unknown, 0 = normal, 1 = alert, 2 = warning, 3 = danger.
 * The UI renders anything below 0 as "No data", and only 3 triggers a push
 * notification, so this function must fail *safe*: whenever the input cannot
 * support a confident classification it returns UNKNOWN, never Normal and
 * never Danger.
 */

export const UNKNOWN_ALERT_LEVEL = -1;

/**
 * Readings older than this are not classified.
 * NOTE: must stay in sync with `STALENESS_THRESHOLD_MS` in
 * src/utils/timeUtils.ts — Convex and the Vite frontend cannot share modules.
 */
export const STALENESS_MS = 2_700_000; // 45 minutes

export interface AlertLevelInput {
  currentWaterLevel: number | null;
  /** JPS waterlevelStatus: 0-3, or -1 meaning "derive from thresholds". */
  waterlevelStatus: number;
  alertLevel: number;
  warningLevel: number;
  dangerLevel: number;
  /** ISO timestamp of the reading. */
  lastUpdate: string;
}

/** The sync coalesces absent thresholds to 0, so 0 means "missing". */
function isUsableThreshold(value: number): boolean {
  return Number.isFinite(value) && value !== 0;
}

export function isReadingStale(lastUpdate: string, now: number): boolean {
  const t = new Date(lastUpdate).getTime();
  if (Number.isNaN(t)) return true;
  return now - t > STALENESS_MS;
}

export function computeAlertLevel(
  station: AlertLevelInput,
  now: number = Date.now()
): number {
  if (station.currentWaterLevel === null) return UNKNOWN_ALERT_LEVEL;

  // A stale reading must not keep a Warning/Danger (or Normal) label alive.
  if (isReadingStale(station.lastUpdate, now)) return UNKNOWN_ALERT_LEVEL;

  switch (station.waterlevelStatus) {
    case 3:
    case 2:
    case 1:
    case 0:
      return station.waterlevelStatus;
    case -1: {
      const { alertLevel, warningLevel, dangerLevel } = station;
      if (
        !isUsableThreshold(alertLevel) ||
        !isUsableThreshold(warningLevel) ||
        !isUsableThreshold(dangerLevel) ||
        !(alertLevel <= warningLevel && warningLevel <= dangerLevel)
      ) {
        return UNKNOWN_ALERT_LEVEL;
      }
      const level = station.currentWaterLevel;
      if (level >= dangerLevel) return 3;
      if (level >= warningLevel) return 2;
      if (level >= alertLevel) return 1;
      return 0;
    }
    default:
      // Unrecognised upstream status: do not report it as safe.
      return UNKNOWN_ALERT_LEVEL;
  }
}
