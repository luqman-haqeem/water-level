import posthog from "posthog-js";

/**
 * Typed catalogue of the custom PostHog events (#75). Add new events here so
 * names and properties stay consistent. See docs/analytics.md for what these
 * events can and cannot be trusted for.
 */
export interface AnalyticsEvents {
    station_watched: { stationId: string; district?: string; threshold?: number };
    station_unwatched: { stationId: string; daysWatched: number | null };
    permission_requested: { stationId: string };
    permission_granted: { stationId: string };
    /** `dismissed`: the prompt was closed without choosing (still "default"). */
    permission_denied: { stationId: string; dismissed: boolean };
    ios_install_required_shown: { stationId?: string };
    alert_opened: { stationId: string; alertLevel: number | null; minsSinceSent: number | null };
    /** `stationId` is absent on /cameras, where cameras are not tied to a station in the UI. */
    camera_opened: { stationId?: string; cameraId?: string; source: "station" | "cameras" };
    location_granted: Record<string, never>;
    location_denied: { reason: "permission" | "unsupported" };
}

export type AnalyticsEvent = keyof AnalyticsEvents;

/** Fire-and-forget: analytics must never break the feature it observes. */
export function track<E extends AnalyticsEvent>(event: E, properties: AnalyticsEvents[E]): void {
    try {
        posthog.capture(event, properties);
    } catch {
        // ignore
    }
}

/** Query params added to push notification URLs so opens can be attributed. */
export const ALERT_URL_PARAMS = {
    source: "src",
    sourceValue: "alert",
    level: "level",
    sentAt: "sent",
} as const;

/**
 * If the current URL came from a push notification, fire `alert_opened` and
 * strip the tracking params so a reload doesn't count twice.
 */
export function trackAlertOpenFromUrl(stationId: string, now: number = Date.now()): void {
    const url = new URL(window.location.href);
    const p = ALERT_URL_PARAMS;
    if (url.searchParams.get(p.source) !== p.sourceValue) return;

    const level = Number(url.searchParams.get(p.level));
    const sent = Number(url.searchParams.get(p.sentAt));
    track("alert_opened", {
        stationId,
        alertLevel: url.searchParams.has(p.level) && Number.isFinite(level) ? level : null,
        minsSinceSent:
            url.searchParams.has(p.sentAt) && Number.isFinite(sent) && sent > 0
                ? Math.max(0, Math.round((now - sent) / 60_000))
                : null,
    });

    url.searchParams.delete(p.source);
    url.searchParams.delete(p.level);
    url.searchParams.delete(p.sentAt);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}
