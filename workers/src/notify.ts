/**
 * Danger notifications.
 *
 * Subscriber state lives in OneSignal as `station_{id}` tags, not in any database we
 * own, so this is a single POST with a tag filter — there is no recipient list to
 * migrate. The only state we keep is the per-station cooldown.
 */

/** Matches the frontend's `isStale` in src/utils/timeUtils.ts. */
const STALENESS_MS = 2_700_000;
const COOLDOWN_SECONDS = 3600;

export interface NotifiableStation {
    id: string;
    station_name: string;
    current_levels: { current_level: number; alert_level: string; updated_at: string } | null;
}

export function buildNotificationPayload(args: {
    appId: string;
    stationId: string;
    stationName: string;
    siteUrl: string;
}) {
    return {
        app_id: args.appId,
        filters: [
            { field: "tag" as const, key: `station_${args.stationId}`, value: "true", relation: "=" as const },
        ],
        headings: { en: "Danger Level Alert" },
        contents: { en: `${args.stationName} has reached Danger level. Check the app for details.` },
        url: `${args.siteUrl}/stations/${args.stationId}`,
    };
}

/**
 * Stations at danger with a reading recent enough to act on.
 *
 * The staleness guard matters more than it looks: JPS keeps serving a station's last
 * reading after its telemetry dies, so without it a gauge that flatlined above the
 * danger threshold would re-alert every hour, forever, and teach people to ignore the
 * alerts that matter.
 */
export function stationsToNotify(stations: NotifiableStation[], now: number): NotifiableStation[] {
    return stations.filter((s) => {
        const reading = s.current_levels;
        if (!reading || reading.alert_level !== "3") return false;
        const age = now - Date.parse(reading.updated_at);
        return Number.isFinite(age) && age <= STALENESS_MS;
    });
}

const cooldownKey = (stationId: string) => `notif:${stationId}`;

/**
 * Sends danger alerts, one station at a time, respecting a one-hour per-station
 * cooldown.
 *
 * The cooldown is a KV key with a TTL rather than a logged timestamp we compare
 * against: expiry is the storage's job, so the window cannot drift or be mis-compared,
 * and nothing accumulates that later needs pruning.
 *
 * The key is written only after OneSignal accepts the request — a failed send must not
 * silence the station for an hour.
 */
export async function notifyDangerStations(
    env: Env,
    stations: NotifiableStation[],
    now: () => number = Date.now
): Promise<{ sent: number; skipped: number }> {
    const appId = env.ONESIGNAL_APP_ID;
    const restApiKey = env.ONESIGNAL_REST_API_KEY;
    if (!appId || !restApiKey) {
        if (stations.length > 0) {
            console.warn("OneSignal not configured; skipping danger notifications");
        }
        return { sent: 0, skipped: stations.length };
    }

    let sent = 0;
    let skipped = 0;

    for (const station of stationsToNotify(stations, now())) {
        const key = cooldownKey(station.id);
        if ((await env.SYNC_STATE.get(key)) !== null) {
            skipped += 1;
            continue;
        }

        try {
            const response = await fetch("https://api.onesignal.com/notifications", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                    Authorization: `Key ${restApiKey}`,
                },
                body: JSON.stringify(
                    buildNotificationPayload({
                        appId,
                        stationId: station.id,
                        stationName: station.station_name,
                        siteUrl: env.SITE_URL ?? "",
                    })
                ),
            });

            if (!response.ok) {
                console.error(
                    `OneSignal rejected the alert for ${station.station_name}: ${response.status} ${await response.text()}`
                );
                continue;
            }

            await env.SYNC_STATE.put(key, "1", { expirationTtl: COOLDOWN_SECONDS });
            sent += 1;
        } catch (error) {
            console.error(`Failed to send danger alert for ${station.station_name}:`, error);
        }
    }

    return { sent, skipped };
}
