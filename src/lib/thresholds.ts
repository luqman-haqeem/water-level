/**
 * Station threshold handling for the UI.
 *
 * `null` means JPS publishes no threshold for that station — a real and common
 * case, not an edge case. It must never be coerced to `0`: every comparison of
 * the form `level >= danger` is true when `danger` is 0, which is how a station
 * with no thresholds ended up rendering as DANGER (#73).
 */

/** Renders a threshold for display, or an honest placeholder when absent. */
export function formatThreshold(value: number | null, unit = "m"): string {
    return value === null ? "Not published" : `${value}${unit}`;
}
