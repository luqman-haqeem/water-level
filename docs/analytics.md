# Analytics (PostHog)

PostHog is initialised in `src/routes/__root.tsx`. Custom events are fired only
through `track()` in `src/lib/analytics.ts`, whose `AnalyticsEvents` type is the
event catalogue. Add new events there rather than calling `posthog.capture`
directly.

## Events

| Event | Properties | Fired from |
|---|---|---|
| `station_watched` | `stationId`, `district?`, `threshold?` (unused until #81) | `subscribeToStation`, once a push subscription is confirmed and the station was not already stored |
| `station_unwatched` | `stationId`, `daysWatched` (`null` for entries saved before this event existed) | `unsubscribeFromStation` (bell and My Stations) |
| `permission_requested` | `stationId` | `subscribeToStation`, only when the browser prompt is actually shown (permission was `default`) |
| `permission_granted` | `stationId` | after that prompt, when OneSignal reports opted in |
| `permission_denied` | `stationId`, `dismissed` | after that prompt: `dismissed: false` = blocked, `true` = closed without choosing |
| `ios_install_required_shown` | `stationId?` | `IosInstallDialog`, when an iOS browser tab taps the bell (#78) |
| `alert_opened` | `stationId`, `alertLevel`, `minsSinceSent` | `/stations/$id` when the URL carries `?src=alert&level=…&sent=…`, added by `buildNotificationPayload` in `convex/notifications.ts`. The params are stripped after tracking. |
| `camera_opened` | `stationId?`, `cameraId?`, `source` | fullscreen camera on `/stations/$id` (`source: "station"`) and `/cameras` (`source: "cameras"`, no `stationId`) |
| `location_granted` | — | `useLocation().requestLocation` |
| `location_denied` | `reason`: `permission` \| `unsupported` | `useLocation().requestLocation` |
| `watch_link_created` / `watch_link_opened` | — | **Not implemented**: the watch link feature (#77) does not exist yet. Add these with it. |

## What PostHog is a source of truth for

- **Relative interest between stations and districts** (`station_watched`), which is the
  only signal of which rivers people care about until subscriptions move server-side (#76).
- **Funnel shape within a session**: bell → prompt → granted/denied, iOS install
  wall, camera and location usage.
- **Push engagement**: how many alerts get opened, and how fast (`minsSinceSent`).

## What it is *not* a source of truth for

- **Subscriber counts or reachability.** Subscriptions live in device `localStorage` and
  OneSignal tags; PostHog only sees the moment of subscribing. OneSignal (and later
  server-side records, #76) is authoritative for who can be alerted.
- **Retention or dormancy.** PostHog's `distinct_id` is in `localStorage`, which Safari
  ITP deletes after 7 days without use, so returning users are counted as new. The
  nine-month off-season decay cannot be measured here; measure it server-side (#76, #79).
- **People.** `person_profiles: "identified_only"` and no `identify()` call means no
  person profiles exist; nothing person-level or cross-device works.
- **Alert delivery.** `alert_opened` only counts taps that open the app. Sent and
  delivered counts are in the OneSignal dashboard.
- **Anything while PostHog is blocked.** Ad blockers and a missing `VITE_POSTHOG_KEY`
  drop events silently; `track()` never throws, so features are unaffected.
