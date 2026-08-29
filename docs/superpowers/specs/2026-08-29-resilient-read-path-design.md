# Resilient read path: static snapshot on Cloudflare R2

**Status:** approved 2026-08-29 (PR #63)
**Date:** 2026-08-29
**Author:** luqman-haqeem (design brainstormed with Claude)

## 1. Why

One reason this app exists is that `infobanjirjps.selangor.gov.my` (InfoBanjir /
JPS Selangor) becomes slow or unreachable exactly when people need it: during a
flood, traffic spikes and JPS's own data feed lags from its nominal 15 minutes to
25 minutes or hours. The goal of this change is that **riverlevel.netlify.app keeps
working as a fallback when both JPS sites are down or overloaded — including when
the fallback itself gets the traffic spike.**

### What is already true

- Water-level data is already decoupled from JPS: a Convex cron scrapes JPS every
  15 min into Convex tables, and the UI reads Convex. If JPS dies, the last
  snapshot stays in Convex and the cron simply throws.

### What breaks today

| Failure | Cause |
|---|---|
| Our site falls over under a traffic spike | Every visitor opens a Convex WebSocket for the full station list **plus one `useQuery` per `StationCard` → `MicroTrendChart` (~270 subscriptions per visitor)**. Convex free-tier bandwidth/function quotas and Netlify function limits are hit exactly when JPS is down. |
| Users cannot tell data is stale | No "last synced" / "JPS last reported" indicator. Cron failure is silent. Our 15-min cron on top of JPS's irregular cadence adds lag. |
| Camera page goes blank | `pages/api/proxy-image/[id].js` fetches `infobanjirjps.selangor.gov.my/.../CCTV_Image/{id}.jpg` live on every request. JPS down ⇒ every camera 500s. |
| Social share cards are broken | (a) `/stations/[id]` emits **no `og:*` tags** for crawlers — the `<Head>` is inside the branch that needs client-side `useQuery` data, so SSR renders "Station not found". (b) `/og/station/:id` returns **502**: the edge function calls `waterLevelData:getCurrentLevelByStationId`, which does not exist, and the URL-param fallback in `utils/ogUrlGenerator.ts` is never wired up. |

### Sizing (measured against production on 2026-08-29)

- 270 stations, 91 cameras.
- `getStationsWithDetails` payload ≈ 97 KB raw, ≈ 15 KB gzipped.
- Cloudflare R2 free tier: 10 GB storage, 1 M Class A (write) ops/month,
  10 M Class B (read) ops/month, **free egress**.
- Camera refresh every 15 min ⇒ 91 × 96 × 30 ≈ 262 k PUTs/month. Every 5 min
  ⇒ ≈ 786 k — too close to the cap, so 5-min refresh is reserved for cameras at
  alert-or-above stations only.

## 2. Decisions made during brainstorming

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Scope | Full resilience pass: scale, staleness UX, camera cache, OG images | Partial fixes |
| Budget | Free tiers; Netlify + Convex stay; add Cloudflare | Paying for Convex/Netlify Pro |
| Public read path | **Always** read a static JSON snapshot; Convex only for auth/favorites/push | "Convex first, snapshot fallback" (two code paths, Convex still eats the spike); "cache + badges only" (doesn't protect quotas) |
| Snapshot storage | **Cloudflare R2**, public bucket behind Cloudflare CDN | Netlify Blobs (same vendor as frontend; counts against 100 GB/month bandwidth) |
| Scraper location | **Stays in Convex**; adds an "upload to R2" step | Cloudflare Worker scraper: Workers free plan allows 50 subrequests per invocation — a scrape (10 district calls + 91 image fetches + 91 R2 puts) can't fit without Workers Paid + Queues. Documented as a future upgrade (§10). |
| Frontend consumption | Browser fetches R2 JSON directly with a short poll | ISR/`getStaticProps` rebuilds (slow, metered builds); Next API route proxying R2 (puts Netlify functions back in the hot path) |

### Decision: domain (resolved 2026-08-29)

**Resolved: the owner already has a domain on Cloudflare; the snapshot is served from a subdomain of it.** Background:
`*.r2.dev` public URLs are rate-limited and uncached (Cloudflare says not for
production); `*.workers.dev` is capped at 100 k requests/day on the free plan,
which a flood-day spike can exhaust in hours. A custom domain on a free
Cloudflare zone gives normal CDN caching with no request cap. The spec assumes
`https://cdn.<your-domain>` as `NEXT_PUBLIC_SNAPSHOT_BASE_URL`; `r2.dev` can be
used for development and as an interim.

## 3. Architecture

```
JPS API ──(Convex cron, every 5 min)──► sync/waterLevelUpdater.updateWaterLevels
                                            │  skip DB writes if JPS allLastUpdated unchanged
                                            ├─► Convex tables (UNCHANGED: currentLevels,
                                            │   waterLevelHistory, waterLevelSummaries)
                                            │     └─ still drive favorites + danger push
                                            └─► sync/snapshotPublisher.publishSnapshot
                                                  ├─ stations.json  (= getStationsWithDetails + syncedAt)
                                                  ├─ cameras.json   (= getCamerasWithDetails + capturedAt)
                                                  ├─ trends.json    (3 h history, keyed by station id)
                                                  └─ meta.json      (syncedAt, jpsLastUpdate, status, error)
                                                          │
                                                          ▼
                                                  Cloudflare R2 bucket  ──► Cloudflare CDN
                                                                                 ▲
JPS CCTV ──(every 15 min; 5 min for alert+)──► sync/cameraImageSync ──► cam/{jpsCameraId}.jpg

Browser ──► {SNAPSHOT_BASE}/stations.json, cameras.json, trends.json, meta.json
        ──► {SNAPSHOT_BASE}/cam/{id}.jpg?v={capturedAt}
        ──► Convex WebSocket ONLY when logged in (favorites, user)

Netlify ──► static Next.js bundle only
        ──► edge fn /og/station/:id  (reads stations.json from R2, s-maxage=300)
```

Properties:

- **Anonymous readers never touch Convex or Netlify functions.**
- **Convex tables and notifications are untouched.** The R2 upload is an extra
  step after a successful scrape, not a replacement.
- **Scrape failure leaves the last good snapshot in place** and only rewrites
  `meta.json` with `status: "upstream_error"`.
- **JPS's own lag is surfaced separately from our sync time**:
  `meta.jpsLastUpdate` (from JPS `allLastUpdated`) vs `meta.syncedAt` (our clock).
- **Writer is swappable**: the frontend only knows R2 URLs, so the scraper can
  move to a Worker later without frontend changes.

## 4. Cloudflare setup (one-time, manual)

1. Create R2 bucket `riverlevel-snapshot` (and `riverlevel-snapshot-dev`).
2. Public access: custom domain `cdn.<domain>` on the bucket (or enable r2.dev
   for interim/dev).
3. CORS on the bucket: `GET, HEAD` from `https://riverlevel.netlify.app`,
   `http://localhost:3000`; expose `ETag`.
4. Create an R2 API token scoped to the bucket with **Object Read & Write**.
5. Cache rules (zone level): honour origin `Cache-Control`; nothing else needed.

Convex environment variables (set on both dev and prod deployments):

```
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET                      # riverlevel-snapshot | riverlevel-snapshot-dev
```

Netlify / `.env.local`:

```
NEXT_PUBLIC_SNAPSHOT_BASE_URL  # https://cdn.<domain>
NEXT_PUBLIC_DATA_SOURCE        # snapshot | convex   (rollback switch, see §11)
```

## 5. Backend: snapshot publisher and scraper changes (Convex)

### 5.1 `convex/lib/r2.ts` — thin S3 client

- Uses `aws4fetch` (fetch + WebCrypto, no Node deps) so it runs in Convex's
  default runtime. If the default runtime rejects it, the publisher file gets a
  `"use node"` directive — it is isolated in its own file for exactly this reason.
- API: `putObject(key, body, { contentType, cacheControl })`. Nothing else.
- Endpoint: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com/{R2_BUCKET}`.

### 5.2 `convex/sync/snapshotPublisher.ts` — `internalAction publishSnapshot`

Args: `{ status: "ok" | "upstream_error", jpsLastUpdate?: string, error?: string, includeData: boolean }`.

1. If `includeData`: `ctx.runQuery` the **existing** `stations.getStationsWithDetails`,
   `cameras.getCamerasWithDetails`, and a new `waterLevelHistory.getAllTrends`
   (one indexed pass over the last 3 h, grouped by station). Reusing the existing
   queries guarantees the JSON shape matches what components already consume.
2. Upload, in order: `trends.json`, `cameras.json`, `stations.json`, then
   `meta.json` **last** so a reader never sees `meta.syncedAt` newer than the data.
3. Object headers: `Content-Type: application/json`,
   `Cache-Control: public, max-age=60, stale-while-revalidate=300`.

`meta.json`:

```json
{
  "syncedAt":      "2026-08-29T08:05:12Z",   // our clock, last successful full sync
  "attemptedAt":   "2026-08-29T08:20:03Z",   // our clock, last attempt (success or not)
  "jpsLastUpdate": "2026-08-29T07:45:00Z",   // JPS allLastUpdated, converted to UTC
  "status":        "ok" | "upstream_error",
  "error":         "HTTP 503 ..."             // present only on upstream_error
}
```

### 5.3 `convex/sync/waterLevelUpdater.ts` changes

- Cron interval **15 min → 5 min**. Skip DB writes when the JPS summary's
  `allLastUpdated` equals the stored value from the previous run (a new
  `syncState` table with a single row: `lastJpsUpdate`, `lastSyncedAt`,
  `lastAttemptAt`, `lastStatus`, `lastError`). Always call `publishSnapshot` with
  `includeData: changed`, so `meta.attemptedAt` moves even on no-change runs.
- Fetches get an `AbortController` timeout (20 s) and one retry with 5 s backoff.
  A slow JPS must not hold the action for its full 10-min budget.
- On failure: **do not throw** after logging. Write `syncState`, call
  `publishSnapshot({ status: "upstream_error", includeData: false })`, return
  `{ success: false }`. The last good data stays in both Convex and R2.
- Function-call budget: 5-min cron ⇒ ~8.6 k runs/month × (1 action + ~12
  mutations/queries) ≈ 110 k calls/month, well under Convex's 1 M free.

### 5.4 `convex/sync/cameraImageSync.ts` — `internalAction`

- Args `{ tier: "all" | "alert" }`. `all` runs every 15 min for every enabled
  camera; `alert` runs every 5 min for cameras whose linked station has
  `alertLevel ≥ 1` (typically a handful).
- Per camera: fetch `http://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image/{id}.jpg`
  with a 10 s timeout, concurrency 5; on 200 + `image/jpeg`, PUT to
  `cam/{jpsCameraId}.jpg` with `Cache-Control: public, max-age=300` and patch
  `cameras.lastImageAt` in Convex (new optional field). On failure: skip — the
  previous image stays on R2.
- `cameras.lastImageAt` flows into `cameras.json` as `captured_at`, and into
  `stations.json` under `cameras.captured_at`.
- Delete `pages/api/proxy-image/[id].js`.

### 5.5 `convex/crons.ts` (production only, as today)

| Job | Interval | Function |
|---|---|---|
| update water levels | 5 min | `sync/waterLevelUpdater.updateWaterLevels` |
| camera images (all) | 15 min | `sync/cameraImageSync` `{tier:"all"}` |
| camera images (alert) | 5 min | `sync/cameraImageSync` `{tier:"alert"}` |
| station / camera metadata | weekly | unchanged |
| cleanup history | 4 h | unchanged |

## 6. Frontend: snapshot data layer

### 6.1 `lib/snapshot.ts`

- `useSnapshot<T>(file: "stations" | "cameras" | "trends" | "meta", opts?)`
  → `{ data, error, isLoading, refresh }`.
- Fetches `${NEXT_PUBLIC_SNAPSHOT_BASE_URL}/${file}.json` with `If-None-Match`
  (ETag) so unchanged polls are 304s. Polls every **120 s**, and on
  `visibilitychange` → visible, `focus`, and pull-to-refresh (the existing
  hook in `hooks/`). Exponential backoff on error, capped at 10 min.
- One in-memory cache per file shared across components (module-level store),
  so mounting 270 cards costs zero extra requests.
- Persists the last good payload to `localStorage` (`snapshot:<file>`) and
  hydrates from it on load, so a cold start with the CDN unreachable still
  renders data, flagged as stale.
- Behind `NEXT_PUBLIC_DATA_SOURCE`: when `"convex"`, the hook wraps the existing
  `useQuery` calls instead. This is the rollback switch and is removed in §11
  cleanup.

### 6.2 Component changes

| File | Change |
|---|---|
| `pages/stations/index.tsx` | `useQuery(api.stations.getStationsWithDetails)` → `useSnapshot("stations")`; the manual `convex.query` refresh paths → `refresh()`. |
| `pages/stations/[id].tsx` | same; trend from `useSnapshot("trends")`. |
| `pages/cameras/index.tsx` | `useSnapshot("cameras")`. |
| `components/MicroTrendChart.tsx`, `MiniTrendChart.tsx` | Drop per-card `useQuery`; take `points` as a prop from `trends.json`. **Removes ~270 subscriptions per visitor.** |
| `components/CameraCard.tsx`, camera thumbnails in `StationCard` | `src = ${SNAPSHOT_BASE}/cam/${jps_camera_id}.jpg?v=${captured_at}`; caption "captured N min ago". |
| `pages/api/stations/[stationId].ts` | Delete (only consumer was the OG function). |
| `pages/_app.tsx` | Keep `ConvexAuthProvider`; Convex is still used for auth/favorites. |

### 6.3 Service worker (`next.config.mjs` → `next-pwa` `runtimeCaching`)

Add a rule for `NEXT_PUBLIC_SNAPSHOT_BASE_URL`: `NetworkFirst`,
`networkTimeoutSeconds: 8`, cache `snapshot`, `maxAgeSeconds: 86400`. Camera
images: `StaleWhileRevalidate`, `maxEntries: 120`. With this, an installed PWA
shows the last data even if R2 is unreachable.

## 7. Staleness UX

`components/DataFreshnessBanner.tsx`, rendered under the header on the stations
and cameras pages, driven by `useSnapshot("meta")` plus the fetch state:

| State | Condition | Banner |
|---|---|---|
| fresh | `status=ok` and `now − jpsLastUpdate < 30 min` | none (timestamps shown in the footer only) |
| jps-lagging | `status=ok` and `now − jpsLastUpdate ≥ 30 min` | amber: "JPS last reported at 15:45 (1 h 10 m ago). Their feed is lagging; we last checked at 16:50." |
| upstream-down | `status=upstream_error` | red: "Can't reach JPS since 16:32. Showing last good data from 16:15." |
| snapshot-unreachable | fetch of `meta.json` failing | grey: "Offline — showing data saved on this device at 16:15." |

Every `StationCard` keeps showing the station's own `updated_at` (from JPS) as
today. Threshold 30 min is a constant in `lib/freshness.ts` alongside a pure
`getFreshnessState(meta, fetchError, now)` so the logic is unit-testable.

## 8. OG images for social sharing

- `pages/stations/[id].tsx`: emit `og:image`, `og:image:width/height`, `og:url`,
  `twitter:card` from `router.query.id` **outside** the data-loaded branch, so
  they appear in SSR HTML. `og:title`/`og:description` stay generic at SSR; the
  image carries the station-specific content.
- `netlify/edge-functions/og-image.tsx`: replace the dead Convex call with one
  fetch of `${SNAPSHOT_BASE}/stations.json`, find the station by id, render name,
  district, level, alert colour, `updated_at`, and the camera thumbnail from
  `${SNAPSHOT_BASE}/cam/{id}.jpg`. Keep `s-maxage=300`. Remove the URL-param
  fallback and delete `utils/ogUrlGenerator.ts`.
- Not in this pass: bot-only edge rewrite for station-specific `og:title`.

## 9. Testing

There is no test suite today. This change adds **Vitest** for pure logic only:

- `lib/freshness.test.ts` — every row of the §7 table, plus boundary at 30 min.
- `convex/sync/__tests__/changeDetection.test.ts` — "skip when `allLastUpdated`
  unchanged", "publish meta on failure without touching data".
- `lib/snapshot.test.ts` — ETag/304 handling, localStorage hydration, backoff.

Integration verification (manual, dev deployment + dev bucket):

1. `npx convex run sync/waterLevelUpdater:updateWaterLevels` → four objects
   appear in the dev bucket; `stations.json` deep-equals the Convex query result.
2. Point `STATION_URL` at an unreachable host → `meta.json` becomes
   `upstream_error`, `stations.json` unchanged, banner turns red.
3. `npx convex run sync/cameraImageSync '{"tier":"all"}'` → 91 JPEGs.
4. `curl -A facebookexternalhit /stations/<id>` shows `og:image`; the OG URL
   returns 200 `image/png`.
5. Block `cdn.<domain>` in DevTools → page still renders from localStorage /
   SW cache with the grey banner.
6. `npm run build && npm run lint` clean.

## 10. Future: move the scraper to a Cloudflare Worker

If Convex becomes the weak link (outage or quota), the writer can move to a
Worker cron on Workers Paid (~USD 5/month) writing the same R2 keys and pushing
to Convex through an HTTP action for favorites/push. The frontend, OG function
and R2 layout do not change. Not planned now.

## 11. Rollout

| Phase | Work | Rollback |
|---|---|---|
| 0 | Domain on Cloudflare, buckets, tokens, env vars | — |
| 1 | §5.1–5.3: publisher + scraper changes. Frontend untouched. Verify objects for a few days. | Remove cron change |
| 2 | §6–7 with `NEXT_PUBLIC_DATA_SOURCE=snapshot` on Netlify | Flip to `convex` and redeploy |
| 3 | §5.4 camera pipeline, delete `proxy-image` | Restore proxy route |
| 4 | §8 OG images | Revert edge function |
| 5 | Cleanup: remove `DATA_SOURCE` switch and Convex read path from pages, delete `api/stations/[stationId].ts`, `ogUrlGenerator.ts`; update `CLAUDE.md` (also fix the stale note that `ConvexAuthProvider` is commented out — it is live). | — |

## 12. Monthly cost at free tier (estimate)

| Resource | Usage | Free limit |
|---|---|---|
| R2 writes | ≈ 300 k (26 k JSON + 262 k images + alert tier) | 1 M |
| R2 reads | CDN-cached; origin reads ≪ 10 M | 10 M |
| R2 storage | < 50 MB | 10 GB |
| R2 egress | unlimited | free |
| Convex function calls | ≈ 150 k (water-level cron ≈ 110 k + camera crons ≈ 40 k) + logged-in users | 1 M |
| Netlify bandwidth | static bundle only | 100 GB |
| Netlify edge invocations | OG only, 5-min cached | 3 M |
