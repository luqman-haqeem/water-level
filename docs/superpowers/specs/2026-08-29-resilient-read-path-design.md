# Resilient read path: static snapshot on Cloudflare R2

**Status:** approved 2026-08-29 (PR #63); revised 2026-08-29 for the Vite codebase on `main`
**Date:** 2026-08-29
**Author:** luqman-haqeem (design brainstormed with Claude)

> **Revision note.** The first draft was written against the stale
> `feature/danger-level-notifications` branch (Next.js Pages Router, Convex
> auth + favorites). `main` is 95 commits ahead: the frontend is a **Vite 6 +
> TanStack Router SPA** (`src/`), there is **no Convex auth or favorites**,
> notifications are OneSignal tag-based, the camera proxy is a Netlify
> Function, and Vitest + CI already exist. The architecture decisions are
> unchanged; every file reference below now matches `main`.

## 1. Why

One reason this app exists is that `infobanjirjps.selangor.gov.my` (InfoBanjir /
JPS Selangor) becomes slow or unreachable exactly when people need it: during a
flood, traffic spikes and JPS's own data feed lags from its nominal 15 minutes to
25 minutes or hours. The goal of this change is that **riverlevel.netlify.app keeps
working as a fallback when both JPS sites are down or overloaded — including when
the fallback itself gets the traffic spike.**

### What is already true

- Water-level data is already decoupled from JPS: a Convex cron
  (`convex/sync/waterLevelUpdater.ts`) scrapes JPS every 15 min into Convex
  tables, and the UI reads Convex. If JPS dies, the last snapshot stays in
  Convex and the cron simply throws. (Verified 2026-08-29: latest reading in
  production was 19 minutes old — the Convex runtime reaches the JPS
  water-level endpoints fine; commit `8c7fded`'s "Convex cannot reach JPS API"
  was about the coordinates endpoint only.)

### What breaks today

| Failure | Cause (on `main`) |
|---|---|
| Our site falls over under a traffic spike | Every visitor opens a Convex WebSocket for the full station list (`src/hooks/useStations.ts`) **plus one `useQuery` per `StationCard` → `MicroTrendChart` → `useStationTrend` (~270 subscriptions per visitor)**. Convex free-tier bandwidth/function quotas are hit exactly when JPS is down. |
| Users cannot tell data is stale | Per-station `isStale()` (45 min) exists, but there is no global "last synced" / "JPS last reported" indicator and cron failure is silent. Our 15-min cron on top of JPS's irregular cadence adds lag. |
| Camera page goes blank | `netlify/functions/proxy-image.ts` (via the `/api/proxy-image/*` redirect in `netlify.toml`) fetches `infobanjirjps.selangor.gov.my/.../CCTV_Image/{id}.jpg` live on every request. JPS down ⇒ every camera 500s; JPS slow ⇒ Netlify function time and invocations burn. |
| Social share cards are broken | (a) It is an SPA: `index.html` has **no `og:*` tags** and every route serves the same shell, so crawlers see a generic card. (b) `/og/station/:id` returns **502**: `netlify/edge-functions/og-image.tsx` calls `waterLevelData:getCurrentLevelByStationId`, which does not exist, and its URL-param fallback is never populated. |

### Sizing (measured against production on 2026-08-29)

- 270 stations (103 with a current reading), 91 cameras.
- `getStationsWithDetails` payload ≈ 97 KB raw, ≈ 15 KB gzipped.
- Cloudflare R2 free tier: 10 GB storage, 1 M Class A (write) ops/month,
  10 M Class B (read) ops/month, **free egress**.
- Camera refresh every 15 min ⇒ 91 × 96 × 30 ≈ 262 k PUTs/month. Every 5 min
  ⇒ ≈ 786 k — too close to the cap, so 5-min refresh is reserved for cameras at
  alert-or-above stations only.

## 2. Decisions

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Scope | Full resilience pass: scale, staleness UX, camera cache, OG images | Partial fixes |
| Budget | Free tiers; Netlify + Convex stay; add Cloudflare | Paying for Convex/Netlify Pro |
| Public read path | **Always** read a static JSON snapshot. After cleanup the browser opens **no Convex connection at all** (nothing on `main` needs one: notifications are OneSignal tags, subscriptions live in localStorage) | "Convex first, snapshot fallback" (two code paths, Convex still eats the spike); "cache + badges only" (doesn't protect quotas) |
| Snapshot storage | **Cloudflare R2**, public bucket on a custom subdomain of the owner's existing Cloudflare domain | Netlify Blobs (same vendor as frontend; counts against 100 GB/month bandwidth); `r2.dev` (rate-limited, uncached); `workers.dev` (100 k req/day cap) |
| Scraper location | **Stays in Convex**; adds an "upload to R2" step | Cloudflare Worker scraper: Workers free plan allows 50 subrequests per invocation — a scrape (10 district calls + 91 image fetches + 91 R2 puts) can't fit without Workers Paid + Queues. Documented as a future upgrade (§10). |
| Frontend consumption | Browser fetches R2 JSON directly with ETag polling | Build-time prerender per station (couples deploys to data); Netlify function proxying R2 (functions back in the hot path) |
| OG tags for an SPA | **Bot-only edge function** on `/stations/:id` that serves a tiny HTML with `og:*` tags; humans pass through to the static shell | HTMLRewriter on every response (Netlify Edge lacks a native one); prerendering 270 HTML files at build |

## 3. Architecture

```
JPS API ──(Convex cron, every 5 min)──► sync/waterLevelUpdater.updateWaterLevels
                                            │  skip DB writes if JPS fingerprint unchanged
                                            ├─► Convex tables (UNCHANGED: currentLevels,
                                            │   waterLevelHistory) + danger push scheduling
                                            ├─► syncState row (fingerprint, timestamps, status)
                                            └─► sync/snapshotPublisher.publishSnapshot ("use node")
                                                  ├─ trends.json    {generatedAt, items: {stationId: TrendPoint[]}}
                                                  ├─ cameras.json   {generatedAt, items: getCamerasWithDetails[]}
                                                  ├─ stations.json  {generatedAt, items: getStationsWithDetails[]}
                                                  └─ meta.json      {syncedAt, attemptedAt, jpsLastUpdate, status, failingSince?, error?}
                                                          │
                                                          ▼
                                                  Cloudflare R2 bucket ──► Cloudflare CDN (cdn.<domain>)
                                                                                 ▲
JPS CCTV ──(every 15 min; 5 min for alert+)──► sync/cameraImageSync ──► cam/{jpsCameraId}.jpg
                                                                       └─► re-publish JSON (captured_at)

Browser (Vite SPA) ──► {VITE_SNAPSHOT_BASE_URL}/stations.json | cameras.json | trends.json | meta.json
                   ──► {VITE_SNAPSHOT_BASE_URL}/cam/{id}.jpg?v={captured_at}
                   ──► (no Convex connection after cleanup)

Netlify ──► static Vite bundle (dist/)
        ──► edge fn /stations/:id   (bots only: HTML with og:* tags, reads stations.json)
        ──► edge fn /og/station/:id (PNG rendered from stations.json + cam jpg, s-maxage=300)
```

Properties:

- **Anonymous readers never touch Convex or Netlify Functions.** The only
  server compute is the two edge functions, and they are bot-only / CDN-cached.
- **Convex tables, the scraper's parsing, and danger-notification scheduling
  are untouched.** The R2 upload is an extra step after a successful scrape.
- **Scrape failure leaves the last good snapshot in place** and only rewrites
  `meta.json` with `status: "upstream_error"`.
- **JPS's own lag is surfaced separately from our sync time**:
  `meta.jpsLastUpdate` (max of JPS `allLastUpdated`, UTC) vs `meta.syncedAt`.
- **Writer is swappable**: the frontend only knows R2 URLs.

## 4. Cloudflare setup (one-time, manual)

1. Create R2 buckets `riverlevel-snapshot` (prod) and `riverlevel-snapshot-dev`.
2. Public access: connect custom domain `cdn.<domain>` to the prod bucket
   (R2 → bucket → Settings → Custom Domains). Enable `r2.dev` on the dev bucket.
3. CORS policy on both buckets:
   ```json
   [{
     "AllowedOrigins": ["https://riverlevel.netlify.app", "http://localhost:5173"],
     "AllowedMethods": ["GET", "HEAD"],
     "AllowedHeaders": ["If-None-Match"],
     "ExposeHeaders": ["ETag"],
     "MaxAgeSeconds": 3600
   }]
   ```
4. Create an R2 API token with **Object Read & Write** scoped to the two buckets.
5. No cache rules needed: objects carry their own `Cache-Control`.

Convex environment variables (`npx convex env set …` on dev, dashboard on prod):

```
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET                      # riverlevel-snapshot | riverlevel-snapshot-dev
```

Netlify (dashboard) / `.env.local`:

```
VITE_SNAPSHOT_BASE_URL         # https://cdn.<domain>   (no trailing slash)
VITE_DATA_SOURCE               # snapshot | convex   (phase-2 rollback switch, removed in phase 5)
VITE_SITE_URL                  # https://riverlevel.netlify.app (already exists; used by edge fns)
```

## 5. Backend (Convex)

### 5.1 Schema (`convex/schema.ts`)

- New table `syncState`: `{ key, lastJpsFingerprint?, lastJpsUpdate?, lastSyncedAt?, lastAttemptAt, lastStatus: "ok"|"upstream_error", failingSince?, lastError? }`, index `by_key`. One row, `key = "waterLevels"`.
- `cameras.lastImageAt: v.optional(v.string())`.

### 5.2 Pure helpers (unit-tested, no Convex runtime)

- `convex/sync/jpsDate.ts` — `convertJpsDateToIso` moved out of the updater and exported.
- `convex/sync/changeDetection.ts` — `computeJpsFingerprint(districts)` (sorted `districtId:allLastUpdated` joined by `|`) and `latestJpsUpdate(districts)` (max ISO).
- `convex/lib/fetchWithRetry.ts` — `fetchWithRetry(url, { timeoutMs=20000, retries=1, backoffMs=5000 })` using `AbortController`; injectable `fetchImpl`/`sleep`.
- `convex/lib/concurrency.ts` — `runWithConcurrency(items, limit, fn)`.
- `convex/lib/r2.ts` — `r2ConfigFromEnv(env)`, `createR2Client(config).putObject(key, body, { contentType, cacheControl })` built on `aws4fetch` (SigV4 over `fetch`, no Node-only deps).
- `convex/sync/snapshotBuilder.ts` — `SNAPSHOT_KEYS`, `cameraImageKey(id)`, `buildDataFiles(...)`, `buildMetaFile(...)`, `JSON_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300"`.

### 5.3 `convex/sync/snapshotPublisher.ts` — `"use node"` `internalAction publishSnapshot({ includeData })`

1. Reads the `syncState` row to build `meta.json` (single source of truth for status/timestamps).
2. If `includeData`: `ctx.runQuery` the **existing** `api.stations.getStationsWithDetails`, `api.cameras.getCamerasWithDetails`, and new `internal.waterLevelHistory.getAllTrends`. Reusing the existing queries guarantees the JSON items match what components already consume.
3. Uploads `trends.json`, `cameras.json`, `stations.json`, then `meta.json` **last** so a reader never sees `meta.syncedAt` newer than the data.
4. Runs in the Node runtime so `aws4fetch` + WebCrypto are guaranteed; isolated in its own file because `"use node"` files may only export actions.

### 5.4 `convex/sync/waterLevelUpdater.ts` changes

- Cron **15 min → 5 min** (`convex/crons.ts`).
- Summary fetch via `fetchWithRetry`. Compute fingerprint; if equal to `syncState.lastJpsFingerprint`, **skip all DB writes**, record the attempt, publish `meta.json` only.
- On summary-fetch failure: **do not throw**. Record `upstream_error` (+ `failingSince` preserved from the previous failing run), publish `meta.json` only, return `{ success: false }`. Last good data stays in Convex and R2.
- Per-district failures stay warn-and-continue as today.
- After a successful changed run: record `ok` with `lastSyncedAt = attemptedAt`, publish with `includeData: true`. Publisher errors are caught and logged — an R2 outage must not fail the Convex write.
- Function-call budget: 5-min cron ⇒ ~8.6 k runs/month × ~13 calls ≈ 110 k/month (Convex free: 1 M).

### 5.5 `convex/sync/cameraImageSync.ts` — `"use node"` `internalAction syncCameraImages({ tier })`

- `tier: "all"` every 15 min (all enabled cameras); `tier: "alert"` every 5 min (cameras whose station's `currentLevels.alertLevel ≥ 1`, via new `internal.cameras.listForImageSync`).
- Per camera, concurrency 5: `fetchWithRetry(CCTV url, { timeoutMs: 10000, retries: 0 })`; require `content-type` starting with `image/` and a non-empty body; PUT to `cam/{jpsCameraId}.jpg` with `Cache-Control: public, max-age=300`; `internal.cameras.setLastImageAt`. Failures are skipped — the previous image stays on R2.
- After the loop, `publishSnapshot({ includeData: true })` so `captured_at` in the JSON is current.
- `cameras.lastImageAt` is exposed as `captured_at` in `getCamerasWithDetails` and under `cameras.captured_at` in the three station queries.

### 5.6 `convex/crons.ts`

| Job | Interval | Function |
|---|---|---|
| update water levels | 5 min | `api.sync.waterLevelUpdater.updateWaterLevels` |
| camera images (all) | 15 min | `internal.sync.cameraImageSync.syncCameraImages {tier:"all"}` |
| camera images (alert) | 5 min | `internal.sync.cameraImageSync.syncCameraImages {tier:"alert"}` |
| station / camera metadata | weekly | unchanged |
| cleanup history | 4 h | unchanged |

## 6. Frontend (Vite SPA)

### 6.1 `src/lib/snapshotStore.ts` (framework-free, unit-tested)

`createSnapshotStore<T>({ baseUrl, file, pollMs = 120_000, fetchImpl, storage, now })` → `{ subscribe, getState, refresh, start, stop }`.

- State: `{ data, error, isLoading, fetchedAt, fromCache }`, replaced immutably (works with `useSyncExternalStore`).
- `start()` hydrates from `storage["snapshot:<file>"]` (data flagged `fromCache`), then `refresh()`.
- `refresh()` GETs `${baseUrl}/${file}.json` with `If-None-Match` when an ETag is known; 304 keeps data; 200 replaces data, stores ETag, persists. Errors keep old data and set `error`.
- Poll timer: `pollMs` after each completed refresh; on error, `min(pollMs × 2^failures, 600_000)`.
- One store per file (module singleton in `src/hooks/useSnapshot.ts`), so mounting 270 cards costs zero extra requests.

### 6.2 `src/hooks/useSnapshot.ts`

`useSnapshot<T>(file)` = `useSyncExternalStore` over the shared store + `visibilitychange`/`focus` listeners that call `refresh()`. `refreshSnapshots()` for pull-to-refresh.

### 6.3 Data hooks keep their signatures

| File | Change |
|---|---|
| `src/hooks/useStations.ts` | `useStations()` → `stations` store. `useDistricts` deleted (unused). |
| `src/hooks/useCameras.ts` | `useCameras()` → `cameras` store. |
| `src/hooks/useStationDetail.ts` | `useStationDetail(id)` → `find` in `stations` store (same item shape as the Convex detail query). |
| `src/hooks/useWaterLevelHistory.ts` | `useStationTrend(id)` → `trends` store lookup. `MicroTrendChart`/`MiniTrendChart` are untouched; the ~270 Convex subscriptions disappear because the hook no longer subscribes. |
| `src/lib/snapshotTypes.ts` | `SnapshotEnvelope<T>`, `SnapshotStation`/`SnapshotCamera` derived with `FunctionReturnType<typeof api.…>` so the frontend shape is provably the Convex query shape; `TrendPoint`, `SnapshotMeta`. |

Phase 2 keeps a build-time switch: each hook module exports `VITE_DATA_SOURCE === "convex" ? convexImpl : snapshotImpl` (no conditional hook calls). Removed in phase 5 together with `ConvexProvider`, `src/lib/convexClient.ts`, and `VITE_CONVEX_URL`.

### 6.4 Camera images

`src/lib/cameraImageUrl.ts`: `cameraImageUrl(baseUrl, jpsCameraId, capturedAt?)` → `${baseUrl}/cam/${id}.jpg?v=${capturedAt}`. Used in `src/components/CameraCard.tsx`, `src/routes/cameras/index.tsx` (fullscreen matching), `src/routes/stations/$id.tsx`. `CameraCard` shows "Captured N min ago" from `captured_at`. Delete `netlify/functions/proxy-image.ts` and its redirect.

### 6.5 PWA (`vite.config.ts` → `VitePWA.workbox.runtimeCaching`)

Replace the `/api/proxy-image/` rule with two rules keyed on `VITE_SNAPSHOT_BASE_URL` (read via `loadEnv`, compiled into a `RegExp` literal because Workbox serialises the config): JSON → `NetworkFirst` (`networkTimeoutSeconds: 8`, `maxAgeSeconds: 86400`); `cam/*.jpg` → `StaleWhileRevalidate` (`maxEntries: 120`, `maxAgeSeconds: 3600`). The `convex.cloud` rule is removed in phase 5.

## 7. Staleness UX

`src/lib/freshness.ts` — pure `getFreshnessState(meta, fetchError, now)`:

| State | Condition | Banner (`src/components/DataFreshnessBanner.tsx`, mounted in `src/routes/__root.tsx` under `OfflineBanner`) |
|---|---|---|
| `fresh` | `status=ok` and `now − jpsLastUpdate < 45 min` (reuses `STALENESS_THRESHOLD_MS` from `src/utils/timeUtils.ts`) | none |
| `jps-lagging` | `status=ok` and `now − jpsLastUpdate ≥ 45 min` | amber: "JPS last reported {fromNow}. Their feed is lagging — we last checked {fromNow}." |
| `upstream-down` | `status=upstream_error` | red: "Can't reach JPS since {fromNow}. Showing last good data from {fromNow}." |
| `snapshot-unreachable` | `meta.json` fetch failing (data may be from localStorage/SW) | grey: "Can't reach the data server — showing data saved on this device {fromNow}." |

Per-station `isStale()` badges on cards are unchanged.

## 8. OG images for social sharing

- `index.html` gets static default `og:*`/`twitter:*` tags (site-wide card).
- New `netlify/edge-functions/station-meta.ts` on `path: "/stations/:id"`: if the `User-Agent` matches a crawler list (facebookexternalhit, Twitterbot, WhatsApp, TelegramBot, LinkedInBot, Slackbot, Discordbot, Googlebot, bingbot, Pinterest, SkypeUriPreview), fetch `stations.json`, find the station, and return a minimal HTML document with station-specific `og:title`, `og:description`, `og:image = {VITE_SITE_URL}/og/station/{id}`, `og:url`, `twitter:card`, plus a `meta refresh` to the SPA route; cached `s-maxage=300`. Otherwise `context.next()`. Pure HTML/UA helpers live in `netlify/edge-functions/lib/stationMeta.ts` and are unit-tested.
- `netlify/edge-functions/og-image.tsx`: replace the dead Convex call with one fetch of `${VITE_SNAPSHOT_BASE_URL}/stations.json`; render name, district, level, alert colour, `updated_at`, online state, and the camera thumbnail from `${VITE_SNAPSHOT_BASE_URL}/cam/{id}.jpg` when the station has a camera. Remove the URL-param fallback. Pin `og_edge` to a version. Keep `s-maxage=300`.

## 9. Testing

Vitest (jsdom, `@testing-library/react`) already runs in CI (`.github/workflows/validate-convex.yml`: lint, `tsc && vite build`, `vitest run`, `convex deploy --dry-run`). `npm run lint` uses `--max-warnings 0`, so new code must be warning-free (no `any`, no `console.log`).

Unit tests (new):

- `convex/sync/__tests__/jpsDate.test.ts`, `changeDetection.test.ts`, `snapshotBuilder.test.ts`
- `convex/lib/__tests__/fetchWithRetry.test.ts`, `concurrency.test.ts`, `r2.test.ts` (stubbed `fetch`; asserts URL, method, SigV4 `Authorization`, headers)
- `src/lib/__tests__/snapshotStore.test.ts`, `freshness.test.ts`, `cameraImageUrl.test.ts`
- `src/components/__tests__/DataFreshnessBanner.test.tsx`
- `netlify/edge-functions/lib/__tests__/stationMeta.test.ts`

Convex functions themselves (`syncState`, `getAllTrends`, actions) are thin orchestration and are verified against the dev deployment, matching the repo's existing convention (see the note in `convex/__tests__/notifications.test.ts`).

Integration verification (manual, dev deployment + dev bucket):

1. `npx convex run sync/waterLevelUpdater:updateWaterLevels` → four objects in the dev bucket; `stations.json.items` deep-equals `npx convex run stations:getStationsWithDetails`.
2. Run it again immediately → `meta.attemptedAt` moves, `syncedAt` does not, only `meta.json` re-uploaded.
3. Temporarily point `BASE_URL` at an unreachable host → `meta.status = upstream_error`, `stations.json` unchanged, red banner.
4. `npx convex run sync/cameraImageSync:syncCameraImages '{"tier":"all"}'` → 91 JPEGs, `captured_at` populated.
5. `curl -A facebookexternalhit https://…/stations/<id>` → HTML with `og:image`; `curl -I …/og/station/<id>` → `200 image/png`.
6. Block `cdn.<domain>` in DevTools → page still renders from localStorage/SW with the grey banner.
7. `npm run lint && npm run build && npm run test` clean.

## 10. Future: move the scraper to a Cloudflare Worker

If Convex becomes the weak link, the writer can move to a Worker cron on
Workers Paid (~USD 5/month) writing the same R2 keys and pushing to Convex through
an HTTP action for danger notifications. Frontend, edge functions and R2 layout
do not change. Not planned now.

## 11. Rollout

| Phase | Work | Rollback |
|---|---|---|
| 0 | §4: buckets, custom domain, CORS, token, env vars; `npm i aws4fetch` | — |
| 1 | §5.1–5.4, 5.6 (water-level cron only): publisher + scraper changes. Frontend untouched. Verify objects for a few days. | Revert `convex/` — `deploy-convex.yml` redeploys |
| 2 | §6.1–6.3, §6.5 (JSON rule), §7 with `VITE_DATA_SOURCE=snapshot` on Netlify | Set `VITE_DATA_SOURCE=convex`, redeploy |
| 3 | §5.5 + §6.4 camera pipeline; delete `proxy-image` function + redirect; SW image rule | Revert the phase-3 commits |
| 4 | §8 OG: `index.html` tags, `station-meta`, `og-image` rewrite | Revert edge functions |
| 5 | Cleanup: remove `VITE_DATA_SOURCE` branches, `ConvexProvider`, `src/lib/convexClient.ts`, `useDistricts`, `convex.cloud` SW rule, `VITE_CONVEX_URL` from `.env.example`/`vite-env.d.ts`/Netlify; update README | — |

## 12. Monthly cost at free tier (estimate)

| Resource | Usage | Free limit |
|---|---|---|
| R2 writes | ≈ 320 k (water-level JSON ≈ 35 k + camera images ≈ 262 k + camera re-publish ≈ 9 k + alert tier) | 1 M |
| R2 reads | CDN-cached; origin reads ≪ 10 M | 10 M |
| R2 storage | < 50 MB | 10 GB |
| R2 egress | unlimited | free |
| Convex function calls | ≈ 150 k (water-level cron ≈ 110 k + camera crons ≈ 40 k) | 1 M |
| Netlify bandwidth | static bundle only | 100 GB |
| Netlify edge invocations | `station-meta` on direct `/stations/:id` loads (bots + humans pass-through) + `og-image` (5-min cached) | 1 M |
