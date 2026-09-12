# Migrate the sync pipeline from Convex to Cloudflare Workers

**Status:** Phase 0 closed 2026-09-05. Phase 1 in progress.
**Date:** 2026-09-02
**Supersedes the backend half of:** `docs/superpowers/specs/2026-08-29-resilient-read-path-design.md`

## Why

The R2 snapshot read path shipped on 2026-08-30 and pushed the full sync pipeline
to the Convex dev deployment. Convex bills **Data egress** as all bytes leaving its
cloud, explicitly including "bandwidth out of your actions", so every camera JPEG
the action PUTs to R2 is billed. Measured against the 1 GB/month free tier:

| Source | Per run | Frequency | Monthly egress |
|---|---|---|---|
| Camera JPEGs -> R2 | ~11.4 MB (92 x ~127 KB) | every 15 min | **~33 GB** |
| Snapshot JSON -> R2 | 212 KB | ~190x/day | **~1.2 GB** |
| | | | **~34 GB vs 1 GB free** |

The JSON alone exceeds the free tier; images exceed it 33x. A second 1 GB meter,
**Database I/O**, is also over, because every publish re-reads all stations, all
cameras and 3 h of history.

Crons are currently disabled on the dev deployment (commit `7aeafd2`, gated behind
`CRONS_ENABLED`), so the bleeding has stopped, but the pipeline cannot be turned
back on in its current form.

The decisive fact: **Convex now stores zero user data.** `src/` has no runtime
Convex usage — the only imports are type-only (`FunctionReturnType`, `Id<>`), which
compile away. The schema is entirely JPS-derived plus `notificationLog` and
`syncState`. Convex is a middleman between JPS and R2, and it costs money precisely
because it sits in the byte path.

On Cloudflare the identical workload is free: JPS -> Worker ingress is free,
Worker -> R2 goes over a binding, and R2 -> user egress is free.

## Goal

Move the entire sync pipeline to Cloudflare Workers + R2 + KV on the **free plan**,
retire Convex, and keep the public snapshot contract byte-identical so the frontend
needs no changes.

## Non-goals

- No frontend changes. Same bucket, same keys, same `pub-*.r2.dev` base URL.
- No custom domain (still deferred, per the 2026-08-30 decision).
- No change to camera refresh cadence — all cameras still refresh every 15 min.
- No paid Cloudflare plan.

## Target architecture

**Two Workers, three cron triggers** (free plan allows 5 per account):

- **`wl-sync`** — `*/15 * * * *` water levels; `0 2 * * SUN` weekly camera metadata
- **`wl-cameras`** — `*/15 * * * *`, mirrors a rotating 1/2 slice of cameras
  (~46 per run, full cycle every 30 min). The slice is derived from the clock
  (`floor(now / SLICE_INTERVAL_MS) % 2`), so no cursor needs storing.

Convex is deleted. No database replaces it:

| Convex today | New home |
|---|---|
| `stations` / `currentLevels` / `districts` | Nothing. The district endpoint already returns names, codes, lat/lng and thresholds, so `stations.json` is built straight from the fetch. |
| `waterLevelHistory` — 3 h trends | `trends.json` in R2; read-append-prune-write on changed runs only |
| `waterLevelHistory` — 14 d retention (`3941656`) | **Not yet designed.** See *History retention* below — migrating as originally written would discard it. |
| `syncState` | One KV key (~288 writes/day, under the 1,000/day free cap) |
| `notificationLog` | KV key per station with a 1 h TTL — the cooldown expires itself |
| `notifyDangerForStation` | One POST to OneSignal, unchanged (subscriber state already lives in OneSignal tags) |

### Upstream endpoints

- Summary: `https://infobanjirjps.selangor.gov.my/JPSAPI/api/StationRiverLevels/GetWLStationSummary`
- Per district: `.../GetWLAllStationData/{districtId}`
- CCTV frames: `https://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image/{id}.jpg`
  (**HTTPS since `23165d2`** — was plain http when this plan was written)

### Public R2 keys (unchanged)

`stations.json`, `cameras.json`, `trends.json`, `meta.json`, `cam/{jpsCameraId}.jpg`

## Free-tier budget

| Resource | Usage | Free limit |
|---|---|---|
| R2 Class A (writes) | ~280k/month | 1M |
| R2 Class B (reads) | negligible | 10M |
| R2 storage | ~12 MB | 10 GB |
| R2 egress | n/a | free |
| Worker invocations | 576/day | 100k/day |
| KV writes | 288/day | 1,000/day |
| External subrequests | 31 (cameras), 10 (water) | 50/invocation |
| Cron triggers | 3 | 5/account |

Binding calls (R2/KV) fall under "subrequests to internal services" (limit 1,000),
not the 50-per-invocation external `fetch()` cap. This is what makes the camera
mirror viable: 31 external fetches + 31 R2 binding PUTs stays legal.

Public traffic hits R2 directly and never touches a Worker, so the 100k/day request
limit is not exposed to user traffic.

## Phases

### Phase 0 — Feasibility spike — RUN 2026-09-02

Executed against a throwaway Worker deployed to the real edge via
`wrangler deploy --temporary` (a preview account, no login required), then deleted.
`wrangler dev` would have proved nothing here: it runs on the developer's machine
with the developer's IP.

| # | Question | Result |
|---|---|---|
| 1 | Does JPS accept Cloudflare IPs? | **PASS** |
| 2 | Does `fetch()` to plain `http://` work from the edge? | **PASS** |
| 3 | Does the build fit in 10 ms CPU? | **PASS, measured 7 ms on a real run** — see Phase 5 |

**1. JPS accepts Cloudflare IPs.** From the deployed Worker the summary endpoint
returned 200 with all 9 districts, and 8/9 district endpoints returned 200. A
12-sample sequential run scored 11/12 from Cloudflare against 12/12 from a home IP,
with near-identical latency distributions.

The prior art that made this the headline risk was a misdiagnosis. Commit `8c7fded`
records "Convex cannot reach JPS API" for `/JPSAPI/api/StationRiverLevels`; that
endpoint returns 200 with 22,233 bytes today. It simply takes 16-22 s. Convex timed
out — JPS never blocked anything.

**2. Plain `http://` works from the edge.** `http://.../CCTV_Image/25.jpg` returned
200, `image/jpeg`, 147,826 bytes in 971 ms. The risk was doubly overstated: the CCTV
host also serves **HTTPS**, verified byte-identical (154,799 bytes) from a home IP.

**Correction (2026-09-04):** this section originally concluded "prefer HTTPS with an
`http://` fallback". That was wrong and is withdrawn. `23165d2` switched the upstream
to HTTPS on the grounds that over cleartext a network attacker can substitute frames
that we mirror to R2 and then serve to every user from our own domain — and an
automatic downgrade on HTTPS failure re-opens exactly that hole. The Phase 0 data
does not support a fallback either: the 522s hit **both** schemes, so they were JPS
flakiness rather than anything TLS-specific. **Retry HTTPS; never downgrade.**

**3. CPU is unresolved, but the numbers are reassuring.** The full production-size
build ran correctly on workerd — 176 stations, 92 cameras, 255 trend series,
178,270 bytes out, 10/10 runs at 200. That does **not** certify the limit: the
temporary preview account does not enforce the free plan's 10 ms cap. 2,048
consecutive full builds in a single invocation (~4 s of CPU) still returned 200.

The usable evidence is a local measurement of the identical pipeline on real
payloads (same V8):

| | CPU ms per full build |
|---|---|
| p50 | 1.97 |
| p95 | 4.79 |
| max | 6.41 |
| **limit** | **10.00** |

Roughly 2x headroom at p95.

**Demoted from blocking to Phase 5 (2026-09-05).** A spike earns blocking status when
failure would mean abandoning the approach — that was true of questions 1 and 2, where
a "no" sent us to GitHub Actions. It is not true here. If the build overruns 10 ms the
answer is "split the raw dump and the build across two chained Workers", which is a
design tweak already in the mitigations below, not a reason to stop. Alongside that:
the failure mode is benign (error 1102 aborts the run, `meta.json` does not advance,
the snapshot goes stale — which the freshness banner and the dead-man's switch already
cover, and nothing corrupts); only ~1/3 of runs rebuild at all, since the rest
short-circuit on the fingerprint; and Phase 5's staging soak measures it on a real
account, over 24 h, as part of work that has to happen anyway. Blocking Phase 1 on a
synthetic one-off measurement bought nothing.

The Phase 0 spike itself was deleted, as spike code should be.

**New finding — JPS's TCP connect is flaky, and it is not Cloudflare-specific.**
About 40% of connections stall ~20 s at `time_connect`, the signature of SYN
retransmission, from both vantage points:

| Vantage point | fast (<1 s) | stalled (~20-23 s) | failed |
|---|---|---|---|
| Cloudflare edge | 6/12 | 4/12 (+2 at ~39 s) | 1 (522) |
| Home IP | 7/12 | 5/12 | 0 |

One sequential pass over 9 districts took 162 s. The 15-minute cron wall clock
absorbs that, but only with **parallel district fetches and an explicit retry
budget** — see Phase 2. Sequential-with-retries would run uncomfortably close on a
bad day.

**Verdict:** proceed. The GitHub Actions fallback is not needed, and would not have
helped anyway — the flakiness is upstream of any host.

### Phase 1 — Scaffold and port shared logic — DONE 2026-09-05

- `workers/` with `wrangler.toml` (`wl-sync`, R2 + KV bindings), `tsconfig.json`,
  `vitest.config.ts`, and a `scheduled()` stub that throws until Phase 2.
- **No cron trigger is declared yet.** An empty handler firing every 5 minutes would
  publish nothing while looking healthy, which is worse than not running.
- `src/shared.ts` is the single import point for the pure modules, which still live
  under `convex/`. Both backends have to run simultaneously through Phase 6, so
  duplicating them would let the copies drift and moving them now would churn
  `convex/` while it is under active development. Phase 7 relocates the sources and
  only that one file changes. The Convex-free property is self-enforcing: a Convex
  import in any of them breaks the Worker bundle and the suite fails to build.
- Ported: `jpsDate`, `changeDetection`, `snapshotBuilder` (with the
  `CAMERA_ID_PATTERN` guard), `fetchWithRetry`, `retention`.
- Root `vitest.config.ts` now defines two projects, `app` and `workers`, so
  `npm run test` runs both and CI needed no change. The `app` project pins `include`
  explicitly, because the default glob would otherwise sweep `workers/**` into jsdom.
- Types come from `wrangler types` (`worker-configuration.d.ts`), which supersedes
  `@cloudflare/workers-types` and derives `Env` from `wrangler.toml`, so the bindings
  cannot drift from what is actually bound. Committed, matching the existing
  `convex/_generated` convention.
- Added `npm run typecheck:workers` and wired it into CI — `workers/` sits outside the
  root tsconfig, so `npm run build` does not cover it.

**Verified:** 185 tests across 26 files (168 app + 17 workers), `npm run build` clean,
`tsc -p workers/tsconfig.json` clean, `wrangler deploy --dry-run` resolves all three
bindings.

**Note:** `npm run lint` fails on this branch with 48 pre-existing warnings against
`--max-warnings 0`. CI invokes eslint without that flag, so CI is green. `workers/`
itself lints clean and is now included in the lint script.

Two findings worth carrying into Phase 2:

1. `convertJpsDateToIso` treats both zone-less JPS formats as Asia/Kuala_Lumpur wall
   clock and shifts them by -8 h. A first attempt at the port asserted the naive
   reading and was wrong by exactly 8 hours — plausible enough to survive review, and
   it would have mis-stamped every reading. Pinned by test.
2. The R2 binding stores keys verbatim; it does not collapse `..` the way the
   aws4fetch URL path did. The traversal that could overwrite `stations.json` is
   therefore structurally absent, not merely guarded. The guard still ports, and a
   test pins both halves of that.

### Phase 2 — `wl-sync` water level Worker — DONE 2026-09-05

`updateWaterLevels` ported to a `scheduled()` handler. Every resilience behaviour is
preserved and pinned by test: summary failure aborts and records `upstream_error`; a
matching fingerprint short-circuits before the district fetches; per-district failures
warn and continue; all-districts-failed is an outage rather than a sync of zero
stations; the fingerprint is withheld when any district failed; `syncState` is read
before the data and `meta.json` written last.

Changes from the Convex version, each forced by evidence:

- **District fetches run concurrently.** Sequential measured 162 s for nine districts
  with the ~20 s stalls; concurrent costs the slowest district, and nine subrequests
  sit far under the 50 cap.
- **Station identity is the JPS `id`** (what Convex stored as `jpsSelId`), not a Convex
  document id. See *Station identity* below.
- **Output is sorted by id and de-duplicated through a `Map`.** Concurrency makes
  arrival order vary, and without a sort the file churns every publish and defeats
  byte-comparison.
- **`cameras.json` is not written here.** The camera mirror owns it; writing an empty
  one from this Worker would blank every camera in the app.

**Verified:** 219 tests / 29 files (168 app + 51 workers) · build clean · workers tsc
and eslint clean · `wrangler deploy --dry-run` resolves all bindings. Against the real
captured JPS payloads the mapper produces 81 stations, all with readings, thresholds
and valid timestamps.

#### Coordinates — a gap this plan had wrong

This plan claimed "the district endpoint already returns names, codes, lat/lng and
thresholds, so `stations.json` is built straight from the fetch". **It returns no
coordinates at all** — measured 0 of 176 stations, every value an empty string. Today's
snapshot has 177/270 with coordinates because Convex holds a hardcoded seed (`8c7fded`).

Coordinates live on `/JPSAPI/api/StationRiverLevels`, which has them for all 81 active
stations and keys them by the same numeric id. That is the endpoint `8c7fded` gave up
on as "Convex cannot reach JPS API" — it is reachable, just slow and subject to the same
~40% stall rate.

So the Worker fetches it alongside the districts, and **falls back to the coordinates in
the previously published `stations.json`** when it fails. A flaky metadata fetch
degrades to "pins are as old as the last success" instead of moving every station to
0,0. Its failure never fails the run.

#### Station identity

The published contract identified stations by **Convex document id**, which the
migration cannot reproduce — JPS has never heard of it, and it is not in the snapshot in
any other form. It reached further than the files: `/stations/$id` routes on it,
`trends.json` is keyed by it, and OneSignal stores subscriptions as `station_{id}` tags
outside our database.

Decision (2026-09-05, owner): switch identity to the JPS id and clear the OneSignal
tags. The owner has since confirmed the only subscriber is the owner's own device, so
there is no user-facing subscription to preserve and no dashboard check outstanding.
Tags can be cleared at cutover.

This also resolves a data-quality problem rather than carrying it across. Production
holds **270 station documents for 177 distinct JPS stations** — 93 duplicates, created
when the upsert matched `jpsSelId` with `.first()` and began writing to the other twin
around 2026-08-26. All 84 non-duplicated stations are dead; every reading belongs to a
duplicated one. Keying on the upstream id makes that failure unrepresentable.

Expect the published station count to drop from **270 to ~81** (`stationStatus === 1`,
which is the filter Convex already applied before storing). Most of the difference is
duplicates and stations that have never reported — the substance of #85.

### Phase 3 — `wl-cameras` mirror Worker — DONE 2026-09-05

A separate Worker and a separate `wrangler.cameras.toml`, on purpose: this is the part
that moves real bytes (~11 MB per full cycle against the snapshot's ~200 KB), so it is
the most likely to need throttling or rolling back without touching the water level sync.

- **Clock-derived slice.** `floor(now / 5 min) % 3`, partitioned by position. Every
  camera lands in exactly one slice, the three together cover the list with no gaps or
  repeats at any length, and no cursor is stored — so a missed or retried run picks up
  whichever third the wall clock points at instead of stalling the rotation.
- **Guards preserved:** skipped entirely while the water level sync reports
  `upstream_error` (mirroring into a known outage just spends subrequests collecting
  failures); aborts after 10 consecutive failures; a camera that fails keeps its
  previous frame, because a stale frame beats a broken image.
- **Content-type and empty-body checks kept.** JPS answers 200 with an HTML error page
  when a camera is down; mirroring that would replace a usable frame with a broken one.
- **`captured_at` is refreshed only for cameras actually mirrored**, so the republish
  cannot clobber whatever the metadata refresh last wrote for the other two thirds.

**Verified:** 232 tests / 30 files (168 app + 64 workers) · build, tsc and eslint clean
· `wrangler deploy --dry-run` resolves all bindings for both Workers.

**Budget:** 92 cameras every 15 min ≈ 8,832 PUTs/day ≈ 265k/month, against R2's 1M
Class A free allowance. This is the ~33 GB/month that was being billed as Convex
egress; on Cloudflare it crosses a binding and costs nothing.

#### Known regression, deferred to Phase 4

Convex ran **two** camera tiers: all cameras every 15 min, plus cameras at
alert-or-above stations every 5 min. The slice rotation gives every camera a uniform
15 min, so **cameras at elevated stations refresh three times more slowly than they do
today** — precisely when they matter most.

It is deferred rather than dropped because the linkage is missing: `cameras.json` carries
no station reference (`camera_name`, `captured_at`, `districts`, `id`, `img_url`,
`jps_camera_id`), and Convex resolved the tier through `cameras.stationId`, a column the
snapshot never published. Phase 4 owns camera metadata, so it should add a station
reference to `cameras.json`; the mirror then runs its slice **plus** any camera at an
elevated station, which stays well inside the 50-subrequest cap because elevated
stations are few.

**This must land before Phase 6.** Cutting over without it degrades exactly the case
the product exists for.

### Phase 4 — Metadata and notifications — DONE 2026-09-06

- **Weekly camera roster** on the `0 2 * * 0` trigger inside `wl-sync`, branching on
  `controller.cron`. If any district fetch fails the published roster is kept rather
  than replaced, since a partial list silently drops every camera in the failed
  districts. `captured_at` is preserved on republish — it belongs to the mirror, and
  nulling it would tell the UI every frame is of unknown age until the rotation came
  round again.
- **No separate station metadata job.** Station details arrive with the readings on
  every run, so the weekly station sync disappears — one fewer cron and one fewer way
  for metadata to contradict the data.
- **Danger notifications** as a single OneSignal POST with a tag filter. Subscriber
  state already lives in OneSignal, so there is no recipient list to migrate. Sent
  *after* publishing: an alert pointing at data the app cannot yet load is worse than
  one that arrives a moment later.
- **Cooldown is a KV key with a 1 h TTL**, not a logged timestamp compared on read.
  Expiry becomes the storage's job, so the window cannot drift and nothing accumulates
  that later needs pruning. The key is written only after OneSignal accepts — a failed
  send must not silence a station for an hour.
- **The 45-minute staleness guard is preserved.** JPS keeps serving a station's last
  reading after its telemetry dies; without the guard a gauge that flatlined above
  danger would re-alert every hour forever and train people to ignore real alerts.

#### The Phase 3 regression is fixed

Cameras at alert-or-above stations are now mirrored **every run**, on top of the slice,
so they no longer degrade to a 15-minute refresh exactly when they matter. Elevated
stations are read from the published `stations.json` — one R2 GET of a file the mirror
already depends on — and there are few of them, so the subrequest count stays far below
the 50 cap.

That needed a camera-to-station link, which JPS does not publish: its camera endpoint
returns only id, name, brand, image URL and online flags. Convex held the association in
`cameras.stationId`, a hand-curated column the snapshot never exposed. It is now
`workers/src/cameraLinks.ts`, exported from the production `cameras` table on
2026-09-06 in **JPS ids** — 37 of 93 cameras carry a link, all 37 resolved with no
dangling references, covering 37 distinct stations. Translating through `jpsSelId` also
resolves the duplicate station documents automatically, since both twins shared it.
`cameras.json` now carries `station_id`, and unlinked cameras simply mirror on the
normal rotation.

**Verified:** 250 tests / 32 files (168 app + 82 workers) · build, tsc and eslint clean
· both Worker configs pass `wrangler deploy --dry-run`.

**Secrets:** `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`, never in wrangler.toml. Set
them in the Cloudflare dashboard (Settings > Variables and Secrets > type *Secret*) or
with `wrangler secret put`; both survive later deploys. Locally they go in
`workers/.env` — decided 2026-09-06 over `.dev.vars`, which the repo already had no
ignore rule for. Wrangler accepts either but never both: `.dev.vars` wins and excludes
`.env` entirely rather than merging, which fails silently.

Both are optional at the type level on purpose — a staging deployment without them
syncs normally and skips alerts with a warning.

### Phase 5 — Staging verification

- Point the Workers at a **staging bucket prefix**, never production. **DONE**
- Run a local frontend against it via `VITE_SNAPSHOT_BASE_URL` and click through.
  **Owner's call — outstanding.**
- Soak for 24 h; confirm cron actually fires every 15 min. **DONE, 71 h —
  see "Soak result" below. Cron does not reliably fire; that is a platform
  property, not a bug in our code.**
- **Measure CPU here** (carried over from Phase 0, question 3). **DONE — settled by
  the soak.** 71 h and 491 invocations across both Workers produced zero
  `exceededCpu` and zero errors of any kind, on a real free-plan account that does
  enforce the 10 ms cap. The Phase 0 figure of 7 ms holds under real traffic; the
  chained-Worker split is not needed and is dropped from the plan.

### Phase 6 — Cutover

Blockers, all of which must be cleared first:

- **Reconcile CORS on the production bucket.** *Corrected 2026-09-11: it is no longer
  true that production has no CORS policy.* It carries the three-origin rule
  (`riverlevel.netlify.app` + both localhost ports) but **not** the
  `https://*.netlify.app` wildcard that `workers/r2-cors.json` and the staging bucket
  have. Production therefore works for the live site and local dev, and fails only for
  Netlify deploy previews. Decide whether previews should read production at all — if
  not, leave production as-is and let previews point at staging. Either way the failure
  mode is worth remembering: it is entirely client-side, so every Worker log shows a
  successful publish while the app loads nothing.
- **Set the OneSignal secrets** on both production Workers (dashboard, never
  `wrangler.toml`). Note that staging has **no** secrets set, so `notify.ts` has been
  taking its `!appId || !restApiKey` early return for the whole soak — the push path
  is unexercised against the live OneSignal API and its first real run will be in
  production. Set the secrets on staging and force one alert-level notification
  before cutover.
- ~~**Decide the cron-reliability question**~~ — **DECIDED 2026-09-11: accept**
  best-effort cron on the free plan. The follow-on work is the Convex standby writer
  (design above), which does not block cutover, plus the dead-man's switch, which
  should ship with it.
- **Design the history store** — see *History retention*. Still open.

Then:

- Repoint the Workers at the production bucket. The bucket is empty, so this is a
  first write, not a swap: Convex keeps serving the live site until
  `VITE_SNAPSHOT_BASE_URL` flips.
- Leave Convex deployed but dormant (`CRONS_ENABLED` unset). Dormant only — it is
  **not** a usable standby, see *Convex as a standby publisher*.
- Watch for one week.

### Phase 7 — Decommission Convex

Only after a clean soak:

- Delete `convex/`, the `convex` dependency, and the type-only imports in
  `src/lib/snapshotTypes.ts` and `src/components/StationCard.tsx` (replace `Id<>` with
  `string`).
- Delete `.github/workflows/deploy-convex.yml`; strip the `npx convex deploy --dry-run`
  step from `validate-convex.yml` and rename it.
- Remove Convex env vars from `.env.example` and Netlify.

## Testing strategy

Baseline today: **24 test files, 168 tests passing** (was 20/134 when this plan
was written; the security and retention work since added coverage). CI already runs
`npm run test`
on every PR.

1. **Existing unit tests** — the pure modules port unchanged, so their tests come
   along and must stay green throughout.
2. **Golden-file equivalence test (the important one)** — the frontend's entire
   contract is four JSON files. Capture real JPS responses as fixtures and today's
   live R2 JSON as golden files, feed the fixtures to the new builder, and diff
   against golden. A byte-identical match means the frontend cannot tell which
   backend produced the data. Catches date-parsing drift, key ordering, rounding and
   null handling — exactly the things that would otherwise surface as subtle UI
   breakage after cutover.
3. **Worker integration tests** via `@cloudflare/vitest-plugin` (current package;
   `vitest-pool-workers` is deprecated). Runs inside workerd with real R2 and KV
   bindings and isolated per-file storage. Asserts: the cron handler writes the
   expected keys, the fingerprint short-circuit skips the rebuild, the three camera
   slices partition all 92 cameras with no gaps or duplicates, and the notification
   cooldown expires on TTL.
4. **Local cron smoke test** —
   `curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"`
   against a staging prefix.
5. **Staging end-to-end** — real app, Worker-produced data, zero production risk.

Layers 1-3 run in CI on every commit.

### What tests cannot cover

- ~~JPS accepting Cloudflare IPs~~ — settled in Phase 0 (pass).
- ~~`http://` CCTV fetch from the edge~~ — settled in Phase 0 (pass).
- The 10 ms CPU limit — Miniflare does not enforce it, and neither does a temporary
  preview account. Needs `wrangler tail` on a real free-plan deployment.
- JPS's ~20 s connect stalls — reproducible but not deterministic; the retry budget
  has to be validated against the live endpoint, not fixtures.

## Monitoring and availability

After the frontend cutover the app depends **entirely** on five R2 objects
(`stations.json`, `cameras.json`, `trends.json`, `meta.json`, `cam/{id}.jpg`). There
is no second read path. That is mostly a good trade — if every writer dies, R2 keeps
serving last-good data, which degrades far better than the app going dark — but it
concentrates the failure modes below.

### `status` is not a freshness signal

Observed 2026-09-04, with dev crons gated off since 2026-09-02:

```
meta.json: {"syncedAt":"2026-09-02T03:32:15.748Z", ..., "status":"ok"}
now:        2026-09-04T10:08Z          # 2 days 6.6 h stale
```

`status` records the outcome of the last sync *attempt*. With no attempts it stays
`"ok"` indefinitely, so it reads healthy while the data rots. **Freshness must be
derived from the age of `syncedAt`**; nothing should alert on `status` alone. The
UI banner already does the right thing here — any new monitor must too.

### Dead-man's switch (must not run on Cloudflare)

The plan's only staleness story today is the UI banner, which informs a visitor who
happens to load the page and tells the operator nothing. Once the migration lands,
Cloudflare is the writer, the store *and* the delivery path, so a Cloudflare-side
failure takes out all three with nothing outside to notice.

Add a **GitHub Actions cron (~30 min)** that fetches `meta.json` and opens or updates
an issue when `syncedAt` is older than ~30 minutes. Free and unlimited on public
repos, and independent of the thing it watches. The 5-15 minute Actions cron delay
that disqualified it as a *sync* fallback is irrelevant for a watchdog.

**Do not enable it before a publisher is running** — with the pipeline currently
stopped it would fire immediately and continuously.

### Accepted limitation: `r2.dev` is uncached

Verified 2026-09-04: responses carry `Cache-Control: public, max-age=60` but **no
`cf-cache-status` header at all** — there is no CDN in front of the bucket, so every
visitor request hits R2 origin, and `r2.dev` is rate-limited by design.

**Accepted for now** (2026-09-04 decision): there is no custom domain available and
traffic is explicitly out of scope. This is recorded rather than dropped because it
bites hardest during a flood, which is the event the app exists for. Revisit before
flood season: attaching a custom domain is free on Cloudflare and puts the CDN in
front of R2. Serving via a Worker + Cache API is the domain-less alternative, but it
puts public traffic under the 100k requests/day cap (~130 sustained visitors at a
2-minute poll), which is the wrong ceiling for the same event.

## History retention

`3941656` split the two windows that had been the same number by coincidence:
`TRENDS_WINDOW_MS` stays 3 h (the public contract), `HISTORY_RETENTION_MS` becomes
14 days. It landed mid-plan and deliberately, because the loss is irreversible and
the Sep-Nov season is open now.

**This plan as originally written would throw that away.** The Convex-to-new-home
table mapped `waterLevelHistory` to `trends.json` and nothing else, so a Worker
pipeline would keep 3 hours and drop the rest — regressing #80 and #82 within days
of a change made specifically to stop that.

### The migration should raise the ceiling, not lower it

14 days is a Convex storage limit, not a preference. `3941656` reasoned it out:
Convex Free caps total storage at 0.5 GB and counts each index as another copy of
the table, and `waterLevelHistory` carries three indexes, so a row costs ~4x its own
size. R2 has **10 GB free and no index multiplication**.

Measured against live data (`trends.json`, 2026-09-04): **103 bytes per point**
in the current verbose shape, 81 active series, ~4 points/hour/station.

| Scenario | Per day | Per year |
|---|---|---|
| Observed rate (81 series x ~4/h x 103 B) | ~0.8 MB | **~0.3 GB** |
| #80's estimate (~1,000 rows/h x 103 B) | ~2.5 MB | **~0.9 GB** |
| Compacted (`{"t":…,"v":…}`, ~30 B) | ~0.7 MB | **~0.3 GB** |

Against a 10 GB free bucket, **12 months is affordable at any of these rates** —
including the full retention #80 ultimately asks for, which Convex Free structurally
cannot hold. `recordedAt` is derivable from `timestamp` and `alertLevel` from the
station thresholds, so compaction is available but not required.

### Sketch (needs its own design pass before Phase 6)

Append-only daily objects, `history/YYYY-MM-DD.json`, written by the same run that
publishes the snapshot. One extra R2 write per changed run (~288/day worst case,
against the ~280k/month Class A budget already in this plan — noise). Reads are
analytical, not on the hot path, so no CDN concern and no `trends.json` change:
the public contract and the golden-file equivalence test both stay exactly as they
are.

Open questions for that pass: whether to compact the row shape; whether the daily
object is rewritten each run or appended as `history/YYYY-MM-DD/HH.json` to avoid
read-modify-write growing through the day; and whether the existing 14 days in
Convex should be exported at cutover or simply left to age out while the new store
accumulates in parallel.

## Phase 0 question 3, finally answered (2026-09-06)

Measured on a real staging invocation via `wrangler tail`:

```
cron: */15 * * * *   outcome: ok   cpuTime: 7 ms   wallTime: 50149 ms
```

**7 ms against the free plan's 10 ms.** It passes, but with less headroom than the
local estimate suggested — local measurement of the same pipeline gave p50 1.97 ms and
p95 4.79 ms, so real workerd costs roughly 1.5x the Node figure. Worth remembering
whenever a local benchmark is used to argue about this limit.

The 50 s wall clock is JPS, not us; CPU time excludes I/O wait.

**The margin now matters more than it did.** This plan assumed only ~1/3 of runs would
rebuild, the rest short-circuiting on the fingerprint. That held at `*/5`. At `*/15` the
poll interval matches JPS's own publish cycle, so most runs *do* find new data and take
the full build path. The expensive path is now the common one, at 70% of budget.

If it ever exceeds: build only on fingerprint change is already in place, gzip is
already dropped, and the fallback is splitting the raw dump and the build across two
chained Workers.

### The same run proved the resilience logic under real failure

```
Failed to fetch district 2: The operation was aborted
1 district fetch(es) failed; fingerprint withheld so the next run retries
OneSignal not configured; skipping danger notifications
wl-sync: success=true changed=true districts=9 stations=79 status=NORMAL
```

A district genuinely timed out against live JPS, and the run warned, continued, published
the other eight, and withheld the fingerprint so the next run retries — exactly the
behaviour ported from Convex, observed in production conditions rather than in a test
with a stubbed failure. The missing OneSignal credentials also degraded as designed:
skipped with a warning rather than failing the sync.

## Scheduling — changed to 15 minutes (2026-09-06)

Both Workers now run `*/15` rather than `*/5`, on the owner's decision. JPS publishes
on a ~15-minute nominal cycle, so 5-minute polling was mostly re-reading unchanged data
and short-circuiting on the fingerprint anyway.

**This forced a matching change to the camera slice, and the trap is worth recording.**
The slice is `floor(now / SLICE_INTERVAL_MS) % SLICE_COUNT`. With the interval left at
5 minutes but the cron moved to 15, every run lands on the same index:

| Run time | Slice with a 5-minute interval |
|---|---|
| +0 min | 0 |
| +15 min | 0 |
| +30 min | 0 |
| +45 min | 0 |

Two thirds of the roster would have frozen permanently, with no error — the mirror would
report success every run while most frames silently aged. `SLICE_INTERVAL_MS` must equal
the cron period, and a test now asserts that against the real `wrangler.cameras.toml`.

`SLICE_COUNT` drops to 2 because 92 cameras still have to fit the free plan's 50
external subrequests per invocation: two slices give ~46 per run. The cost is that a
quiet camera now refreshes every 30 minutes rather than 15. Cameras at alert-or-above
stations bypass the rotation and are still mirrored every run, so the degradation
applies only where it does not matter.

## Bucket CORS (found in staging, 2026-09-06)

The deploy preview failed to load any data: the bucket allowed
`https://riverlevel.netlify.app` and localhost, but Netlify gives every PR its own
origin (`deploy-preview-64--riverlevel.netlify.app`), which that list does not cover.

Policy now lives in `workers/r2-cors.json` and includes `https://*.netlify.app`, which
R2 honours — verified by preflight returning 204 with the specific origin echoed back.
`If-None-Match` must be allowed and `ETag` exposed, or the snapshot store's ETag polling
degrades to a full refetch every cycle instead of a 304.

**Cutover requirement:** the production bucket has no CORS policy at all — nothing has
ever read from it — so applying this is a prerequisite for Phase 6, not an afterthought.
Without it the app loads zero data, and the failure is entirely client-side, so nothing
in the Worker logs would show it.

## Soak result (2026-09-09)

71 hours on staging, 2026-09-06 16:00Z to 2026-09-09 15:00Z, both Workers, read
from the `workersInvocationsAdaptive` GraphQL dataset.

**Re-measured 2026-09-11 over the full 119 h**, 2026-09-06 16:00Z → 2026-09-11 14:45Z:

| | `wl-sync` | `wl-cameras` |
|---|---|---|
| Windows expected (`*/15`) | 476 | 476 |
| Windows that actually fired | 410 | 411 |
| **Missed** | **66 (13.9%)** | **65 (13.7%)** |
| Errors | 0 | 0 |
| Multi-hour outages | 3.50 h (09-08 23:45 → 09-09 03:15), 2.75 h (09-11 12:15 → ongoing) | 2.50 h, 2.75 h — **same windows** |
| Isolated single-window misses | 37 | 36 |

**Measurement caveat, recorded so it is not rediscovered.** The cron's firing minute
drifted from `:00/:15/:30/:45` to `:01/:16/:31/:46` on 09-09 at 22:16 and stayed
there. Bucketing invocations by exact minute — rather than flooring them into their
15-minute window — makes that drift read as a fabricated 32-hour outage. Cloudflare
fires cron *approximately* on schedule; any future analysis must floor to the window.
The 14% figure below survived the correction unchanged.

Zero errors across 71 hours: no `scriptThrewException`, no `exceededCpu`, no 1102.
Every invocation that ran, succeeded. **The 10 ms CPU limit is not a problem** —
the 7 ms measurement from Phase 0 holds under three days of real traffic.

### Cron delivery is best-effort, and it shows

One window in seven never fires. Most misses are single windows, which the next
run absorbs invisibly: JPS publishes every 15 minutes, so a skipped window costs
one reading, and the fingerprint short-circuit means ~2/3 of runs had nothing new
to publish anyway.

The multi-hour outages are the finding that matters, and there are now **two of
them**. In both, **both Workers went dark inside the same minute and recovered
together**, with no errors on either side of the gap. Two independently deployed
scripts stopping and restarting in lockstep is the free plan's documented "runs on
underutilized machines" scheduling, not our code failing. Nothing in the repo can
prevent it.

The second one was still in progress when this was written (09-11 12:15Z onward,
2.75 h and counting, snapshot frozen at `syncedAt 11:45Z`), which settles that the
first was not a one-off. Two in five days, on a flood app.

What a user would have seen during those 3.5 hours is the design working:
`meta.json` stopped advancing, `attemptedAt` aged past `STALENESS_THRESHOLD_MS`
(45 min), `freshness.ts` returned `snapshot-stale`, `DataFreshnessBanner` said so,
and `StationCard` dimmed every reading to `alert_level = -1`. Stale data was
labelled stale rather than served as current. That is the correct failure, but it
is still 3.5 hours of a flood app showing nothing current — during a flood, that is
the window that matters most.

**DECIDED 2026-09-11 by the owner: accept it.** Occasional multi-hour staleness,
honestly labelled by the freshness banner, on the free plan. The alternatives
considered and declined were Workers Paid ($5/month, non-best-effort cron plus a
lifted CPU cap) and building the Actions standby publisher now.

Accepting raises the priority of the **dead-man's switch** rather than lowering it.
Under this decision the app's staleness story is entirely client-side: a visitor who
loads the page sees the banner, and nobody else learns anything. The off-Cloudflare
GitHub Actions watchdog on `syncedAt` age is now the *only* thing that would tell the
owner the pipeline stopped, so it should land with or shortly after Phase 6. The
Actions standby *publisher* stays deferred; the Actions *watchdog* does not.

### Why the Workers stop triggering (answered 2026-09-11)

Two distinct causes, and only one of them is the free plan.

**1. The baseline ~10% single-window misses — free-plan best-effort scheduling.**
Cloudflare schedules free-plan cron on underutilized capacity, so individual windows
are dropped. Measured over the 75 h *before* any platform incident: 14.6% of windows
missed, or **10.4% excluding the single 3.5 h outage**. Almost all are isolated
single windows that the next run absorbs invisibly. Not fixable in our code, and this
is what the owner accepted.

**2. The current multi-hour blackout — an open Cloudflare incident.**
[Workers Cron Triggers degraded](https://www.cloudflarestatus.com/incidents/sjs8s0q2x4hw),
opened **2026-09-09 19:17Z**, still at status `identified` — not resolved — when
checked on 09-11 15:57Z. Cloudflare's own wording: *"Workers Cron Triggers may not
execute or may be delayed in executing. Updates to Workers Cron Triggers may take some
time to take effect."*

The local evidence matches it precisely:

- The cron's firing minute drifted from `:00/:15/:30/:45` to `:01/:16/:31/:46` at
  **09-09 22:16Z**, three hours after the incident opened, and never drifted back.
- Both Workers' final invocation was at **09-11 12:00Z** with status
  `clientDisconnected`, *in the same minute*, after which neither has run for 4 h.
- Their cron triggers are still correctly registered — verified against
  `/workers/scripts/{name}/schedules`, both showing `*/15 * * * *`. Nothing is
  misconfigured on our side; the schedule exists and is simply not being executed.

Note that the incident did **not** inflate the single-window miss rate: measured from
the incident opening to the blackout, misses actually fell to 6.7%. The incident
manifests as total stoppage, not as degradation.

**3. The 09-08 3.5 h outage is unexplained.** It predates the incident by ~20 hours,
so it is either free-plan scheduling at its worst or an unreported blip. Both Workers
went dark and recovered together there too.

**What this means for the accept decision.** The 4 h blackout being a platform
incident rather than the free plan is *mildly* reassuring — a paid plan would not
obviously have been immune, since the incident names Workers Cron Triggers generally
and not a plan tier. The steady-state cost of staying free is the 10.4% single-window
miss rate, which is benign. The tail risk is what the dead-man's switch exists for.

### Convex running the old DB pipeline as a standby — rejected (2026-09-09)

> **Superseded in scope, not in reasoning (2026-09-11).** What is rejected below is
> reviving the *existing Convex pipeline* — the one that reads the Convex database and
> publishes document IDs. That rejection stands and is the reason the design in
> *Convex as an off-Cloudflare mirror* takes the shape it does: Convex mirrors the R2
> **file contract**, and never becomes a second source of truth.

The obvious fourth option, raised by the owner: keep Convex alive as a fallback
publisher that takes over when the Cloudflare snapshot goes stale. Investigated and
rejected. Three findings, in order of how much they matter.

**1. There is nothing to keep alive.** `syncState` is empty on the *production*
deployment — the R2 publisher only ever ran on Convex **dev**, whose crons are off
(`7aeafd2`). Production still runs the legacy DB-only pipeline and has never written
a byte to R2. So this is not "leave a working thing running as insurance", it is
"build a second publisher and re-enable the crons the migration switched off".
Convex's own cron is healthy — production wrote a reading 6 minutes before this was
checked — but health is not the constraint.

**2. The two backends no longer publish the same contract.** This is the blocker.
`convex/stations.ts:56` emits `id: station._id`, a Convex document ID, over **270
station documents** (counted in prod: 177 real stations plus 93 duplicates from the
old `.first()` upsert). The Workers path emits JPS ids over a deduplicated set. A
Convex standby would therefore swap the entire public contract at the moment it
fired: different station set, different ids, so routes 404, favorites break, and
OneSignal tags stop matching — all of it **during the outage**, which is the one
moment the app has to work. Closing that gap means porting the identity switch and
the dedupe into Convex and then maintaining two implementations of one pipeline
forever, with the standby almost never exercised. Untested failover is how a backup
becomes the second failure.

**3. Cost is the weakest objection, contrary to the framing in *Why*.** The ~34
GB/month figure assumes Convex publishes every run. A standby that only fires after
45 minutes of staleness would have published ~12 times across the 3.5 h gap: ~140 MB
with camera frames, ~2.5 MB for water-level JSON alone. Both fit the free tier. The
money is not what rules this out; the divergence in finding 2 is.

**Chosen instead: GitHub Actions as the standby publisher.** This plan dismissed
Actions as a *sync* path over its 5-15 minute cron delay, and that reasoning does not
carry over — the delay is irrelevant to a standby that only fires once the snapshot
is already 45+ minutes stale. It wins on the exact axis Convex loses: it runs the
same `workers/src` code, so there is one implementation, one identity scheme, and no
contract to keep in sync. Free and unlimited on public repos, independent of
Cloudflare, and it reaches R2 over the S3-compatible API. It also folds into the
dead-man's switch — one job checks `meta.json` staleness and either alerts or
publishes.

Needs its own design pass before it is built. Phase 7 stands as written.

**Unrelated bug found while checking (legacy path only).** Production Convex writes
`recordedAt: "2026-09-09T23:13:08.083Z"` where the numeric `timestamp` field decodes
to `15:13:08Z` — Malaysia time stamped as UTC, 8 hours ahead. It is confined to the
legacy pipeline that Phase 7 deletes, so it needs no fix, but it is one more reason
not to treat Convex production as a trustworthy source.

### `workers.dev` disabled on both Workers

The soak also caught 72 invocations that were not cron: bursts of up to 10 in a
single minute, hitting the public `*.workers.dev` hostname. Neither Worker exports
a `fetch` handler, so these were scanners probing a URL that can only ever return
an error — while still billing against the free plan's 100k requests/day and
producing the `clientDisconnected` status in the analytics.

`workers_dev = false` in both configs. Cron triggers do not use that hostname, and
both deployments were re-verified to keep their schedules afterwards.

## Convex as a standby writer (design, 2026-09-12) — CURRENT

Supersedes *Convex as an off-Cloudflare mirror* below. Not built.

### The problem, stated precisely

Free-plan Worker cron is best-effort capacity — Cloudflare schedules it on
underutilized machines. Measured over 119 h: 13.9% of windows never fire, and there
have been two multi-hour blackouts (3.50 h on 09-08, 6 h on 09-11) in which **both**
Workers stopped inside the same minute and recovered together.

The owner's framing, and it is the right one: *the problem is not R2.* R2 stayed
perfectly healthy through both blackouts and kept serving. The failure is that nothing
was **writing** to it.

### Why this is a writer, not a reader

The earlier mirror design had Convex serve a copy of the snapshot so the frontend could
read from it when R2 went stale. That solves the wrong half of the problem:

- R2 is not the thing that failed, so reading elsewhere is not required.
- A mirror copies whatever R2 holds. During a cron blackout that is *stale data*, so
  the mirror would have served the identical frozen readings and helped nobody.
- R2 is plain S3-compatible storage. Anything holding credentials can write to it; the
  Worker is not privileged. "R2 will be stale" is only true while the Worker is the
  sole writer.

So the fix is a second **writer**. R2 stays the single source of truth, and the
frontend needs **no changes at all** — no fallback URL, no staleness-triggered source
switching, no second read path, no `convex/http.ts`, no CORS.

### Mechanism

One Convex cron at `*/15`. Its first act is a public GET of `meta.json` from R2:

- **`attemptedAt` newer than `STALENESS_THRESHOLD_MS` (45 min)** → the Worker is alive.
  Return immediately. Costs one small request.
- **Stale, or the fetch fails** → run the full JPS→snapshot path and publish to R2.

Failover and failback are the same code path evaluated every 15 minutes, so it arms and
disarms itself with no flag, no deploy and no 2am decision. Note this cannot use the
`CRONS_ENABLED` gate: per `convex/crons.ts:16` that flag is read at push time and would
need a deploy to toggle. The check must live **inside** the handler.

The 45-minute threshold also keeps the two writers apart. `trends.json` is
read-modify-write, so simultaneous publishers would silently drop one side's readings;
waiting three missed windows before acting makes overlap unlikely, though not
impossible.

### Egress — the constraint the owner flagged, quantified

Convex bills every byte leaving it, and a `putObject` body is egress. Measured sizes:

| File | Size | Republished by standby? |
|---|---|---|
| `stations.json` | 35 K | yes |
| `trends.json` | 53 K | yes |
| `meta.json` | 137 B | yes |
| `cameras.json` | 24 K | no — weekly roster, untouched |

**A standby publish is 88 KB**, not the 212 KB assumed in *Why*.

- *Expected:* ~57 h of blackout per month at the observed rate → ~228 publishes →
  **~20 MB/month**, roughly 2% of the 1 GB free tier. Health checks add ~3 MB.
- *Worst case, Convex publishing continuously all month:* 2,880 × 88 KB =
  **~253 MB/month** — still a quarter of the tier. **Even total, permanent failover
  fits in the free plan.**

This is not the 34 GB/month that motivated the migration. That figure was **97% camera
JPEGs** — 11.4 MB every 15 minutes. The JSON share was ~1.2 GB at a 5-minute cadence
with larger payloads; at today's 15 minutes and 88 KB the same workload is ~253 MB.

### Guard rail: the standby must never mirror camera frames

One image-mirroring run is 11.4 MB — more than half a month's standby budget in a
single invocation, and the single line item that made Convex expensive before. This
belongs in the code as an enforced constraint, not a comment: the standby entry point
must not be able to reach `syncCameraImages` or any equivalent. Camera frames freeze
during a blackout, by design.

### Implementation notes

- **Reuse, not rewrite.** `convex/lib/r2.ts:41` is already a working S3 client and
  `snapshotPublisher.ts:42` already calls `putObject` — this is the path that published
  to R2 from Convex in August.
- **Bundling is confirmed** (see *Verification results* below): Convex executes code
  imported from `workers/src/`, so the JPS→snapshot logic is shared, not duplicated.
- **Typecheck seam.** Convex must import only the Cloudflare-free modules (`jps.ts`,
  `stationMapper.ts`, `cameraLinks.ts`, `stationCameras.ts`) and reach the rest through
  a port interface, or `tsc` fails on `R2Bucket` / `KVNamespace` / `Env`.
- **`syncState`** goes in the existing, currently empty Convex table
  (`convex/schema.ts:87`). On failback the Worker's KV holds a stale fingerprint and
  rebuilds once. Harmless.
- **Prerequisite:** Convex's egress overage must clear at Phase 6, when the frontend
  stops reading Convex. Confirm on the dashboard before relying on this.

### Camera frames during a blackout

R2 frames do not disappear when the Worker stops — they simply stop refreshing, and the
app keeps serving the last mirrored copy with its true `captured_at`. The open question
is whether to additionally fall back to JPS directly for a live frame.

**Verified 2026-09-12 — viable, but slow:**

```
https://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image/25.jpg
  code=200  type=image/jpeg  size=111580  ssl_verify_result=0  time=21.5s
```

The certificate validates, so no browser warning, and a plain `<img src>` needs no CORS.

**Two hard constraints if this is built:**

1. **The stored `img_url` cannot be used.** All 91 published values are `http://`. An
   HTTPS page blocks mixed content outright, so the URL must be rewritten to `https://`
   at render time. This is an *upgrade* and therefore consistent with `23165d2` — the
   rule that bans downgrading to `http://` is not in tension with it. Falling back to
   the raw stored URL would be both blocked by the browser and a re-opened MITM hole.
2. **It is slow and it points users at a flaky origin.** 21.5 s here, and ~40% of JPS
   connections stall ~20 s at TCP connect. Every viewer would hit JPS directly, on the
   exact day traffic peaks, at an origin already known to return 522s under load.

**Owner's requirement, 2026-09-12: never show a stale camera frame.** *"Even though the
Worker cannot process the image into R2, the image is still live at the JPS URL — I
don't want users to see stale camera images."*

This overrides the earlier "defer" recommendation, and it is the right call. A CCTV frame
is the one element users read as *what it looks like right now*; a timestamp underneath
does not undo that impression. During a flood a two-hour-old frame showing a calm river
is actively misleading in a way a stale number is not.

#### Mechanism: choose the source by freshness, do not chain through failures

```
isStale(camera.captured_at, 45 min)
    ? src = live JPS frame over HTTPS
    : src = mirrored R2 frame
onError → /nocctv.png      // unchanged
```

Selecting the source is strictly simpler than the fallback chain sketched above: there
is only ever one failure step, so `CameraCard`'s existing single-swap `onError` handler
works **as-is**. No stage state, no loop, no `hasImageError` rework. The correction two
paragraphs up applies only to the chained design, which this replaces.

`captured_at` is the correct staleness signal: it records when the frame was mirrored, so
if `wl-cameras` stops, it stops advancing and correctly reports the frame's true age.
Reuse `STALENESS_THRESHOLD_MS` (45 min) rather than inventing a second threshold.

#### Construct the URL, never pass `img_url` into `src`

All 91 published entries share exactly one prefix and the filename is always
`jps_camera_id`:

```
http://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image/{jps_camera_id}.jpg
```

So build the URL from `jps_camera_id` against a constant HTTPS base, and do **not**
interpolate the upstream-controlled `img_url` into an element attribute. `jps_camera_id`
is already constrained by `CAMERA_ID_PATTERN` in `cameraImageKey`, and this is the same
reasoning that guard documents: JPS is not attacker-controlled today, but a hostile or
malformed upstream should not be able to steer where the browser fetches from.

Two consequences of the data:

- Every entry must be `https://`. All 91 stored values are `http://`, which an HTTPS page
  blocks as mixed content. Building from a constant HTTPS base makes that structural
  rather than a rewrite that could be forgotten.
- **Camera 247 has an empty `img_url`** and no live frame. It must fall through to
  `/nocctv.png` rather than constructing a URL that 404s.

Add a cache-buster rounded to the minute; without one the browser may serve a cached
frame, and with one keyed to every render it would refetch a 300 KB image continuously.

#### Measured cost (2026-09-12)

Real roster ids over HTTPS, certificate valid (`ssl_verify_result=0`), all 200:

| Camera | Total | Size |
|---|---|---|
| 25 | 1.8 s | 112 KB |
| 234 | 24.2 s | 227 KB |
| 246 | 23.8 s | 74 KB |
| 1265 | 24.3 s | 328 KB |

Roughly **half of loads stall ~24 s** at TCP connect — the same SYN-retransmission
behaviour documented in Phase 0 from both Cloudflare and a home IP — and the other half
return in under two seconds. Frames are 74–328 KB, larger than the mirrored copies.

This is acceptable given the requirement: a slow-loading live frame, or a placeholder, is
strictly better than a confident stale one. Points worth accepting explicitly:

- Users see a spinner for ~24 s about half the time while a stale frame is on screen
  **only during a mirror outage** — never in normal operation.
- Every viewer hits JPS directly, on the day traffic peaks, at an origin that returns
  522s under load. `loading="lazy"` is already set on the `<img>`
  (`CameraCard.tsx:95`), so the cameras list only fetches visible cards rather than all 92.
- Viewer IPs are exposed to JPS, which is the data's owner anyway.

## Convex as an off-Cloudflare mirror (design, 2026-09-11) — SUPERSEDED

> **Superseded 2026-09-12 by *Convex as a standby writer* above.** The owner clarified
> that the failure mode is the Worker not running, not R2 being unavailable — and R2
> stayed healthy through both observed blackouts. Since anything with S3 credentials can
> write to R2, a second *writer* fixes it with no frontend change, where this design
> needed an HTTP router, CORS, a fallback URL and a second read path to fix a failure
> that has not occurred. Kept because its **verification results and scope decision below
> remain valid and carry over.** Revisit only if R2 itself ever fails.

**Owner's design, approved in principle 2026-09-11: "convert Convex to have a similar
structure as R2."** Not built. This section is the design pass; it needs its own
review before any code lands.

### The failure mode this exists for

The 09-11 outage took out cron only — R2 stayed up and the app kept serving, just
stale. A standby that *writes to R2* covers that case completely. It does nothing at
all for the case where Cloudflare is down as a whole: then R2 is unreachable, and it
does not matter who is publishing because the app cannot read anything.

That second case is what this design covers, and it is why the mirror has to serve
HTTP from outside Cloudflare. Convex is the natural host: it is already provisioned,
already paid for at $0, and on a completely separate control plane.

### Principle: mirror the file contract, never the data model

The frontend must not learn to read Convex. If it calls Convex queries directly it
gets document IDs over 270 station rows — the exact contract break that got the DB
standby rejected — plus the `convex` client back in the bundle and a second fetch
mechanism (reactive websocket) with different loading, error and caching semantics
from the ETag-polled JSON path.

So Convex stores and serves **the same four files, byte-identical**:

| Key | Source of truth | Mirrored |
|---|---|---|
| `stations.json` | R2 | yes |
| `cameras.json` | R2 | yes |
| `trends.json` | R2 | yes |
| `meta.json` | R2 | yes |
| `cam/{id}.jpg` | R2 | **no** — see below |

Camera frames are deliberately excluded: 92 × ~127 KB is 11.4 MB per refresh, which
would dominate Convex egress for a nice-to-have. During a total Cloudflare outage the
images 404, and `CameraCard`'s existing `onError` handler already swaps in
`/nocctv.png`. Levels stay live; frames degrade visibly. That is the right trade for a
flood app.

### Storage

A `snapshotMirror` table, one row per key: `{ key, body, contentType, etag, updatedAt }`.
Simpler than Convex file storage for four small objects, and directly queryable by the
HTTP handler.

**Constraint to watch:** Convex documents cap at 1 MB. Today the whole snapshot is
~178 KB, so every file fits comfortably. If *History retention* lands with a 14-day
`trends.json`, that file will outgrow a single document and the mirror must move to
Convex file storage. These two designs are coupled and should be settled together.

### Serving

A new `convex/http.ts` router exposing `GET /{file}.json` at
`<deployment>.convex.site`, returning the stored body with the same
`JSON_CACHE_CONTROL` and ETag the Worker sets, plus `If-None-Match` handling so the
frontend's revalidation keeps working unchanged. CORS must allow the Netlify origins —
the same list as `workers/r2-cors.json`.

### The cron arms and disarms itself

One Convex cron at `*/15`, registered permanently. Its first act is to read `meta.json`
from R2:

- **Fresh (< 45 min, matching `STALENESS_THRESHOLD_MS`)** → *mirror mode*. Cloudflare is
  healthy. Copy R2's published JSON into the mirror table, but only when the ETag has
  changed, so an unchanged run costs four conditional GETs and no writes.
- **Stale, or the read fails outright** → *standby mode*. Run the full
  `jps.ts` → `stationMapper.ts` → `buildDataFiles` path, write to the mirror, and
  attempt R2 as well in case only cron is down.

No flag to flip, no deploy, and no 2am decision: failover and failback are the same
code path evaluated every 15 minutes. This replaces the `CRONS_ENABLED` gate for this
job, because per `convex/crons.ts:16` that flag is read at push time and would need a
deploy to toggle — useless as a failover switch. The gate must live *inside* the
handler.

### Frontend fallback

There is exactly one fetch chokepoint, `snapshotStore.ts:52`:

```ts
const url = `${baseUrl}/${file}.json`;
```

It becomes an ordered list of base URLs — R2 first, the mirror second. **Primary is
always tried first, so failback needs no detection logic at all.** A short circuit
breaker (skip the primary for a few minutes after a failure) avoids paying a failed
request on every poll during a sustained outage.

`VITE_SNAPSHOT_BASE_URL` gains a sibling, `VITE_SNAPSHOT_FALLBACK_URL`. When it is
unset the behaviour is exactly today's, which keeps the change inert until configured.

### Cost

Convex bills **Data egress** and **Database I/O**, both with 1 GB/month free.

- *Mirror mode, steady state:* ingress from R2 is free; only changed files are written.
  With the fingerprint short-circuit skipping ~2/3 of runs, DB I/O lands well under the
  free tier. **This must be measured, not assumed** — an unconditional 212 KB copy every
  15 minutes would be ~0.6 GB/month of DB I/O on its own, most of the budget, so the
  ETag check is load-bearing rather than an optimisation.
- *During an outage:* the mirror serves real users, ~212 KB per client load. This is the
  genuine exposure, and a flood-day traffic spike is exactly when it would bite. Same
  shape as the accepted `r2.dev` caching limitation, and worth revisiting alongside it.

### What this costs structurally

Phase 7 **shrinks rather than completes**. The standby action, the HTTP router, the R2
client and the shared modules stay; the database tables, schema, auth config and the
whole legacy sync pipeline still go. That is a permanent second deployment target to
keep working — the price of surviving a total Cloudflare outage, paid whether or not
one ever happens.

### Scope: the mirror is a lifeboat, not an archive

**Owner's decision, 2026-09-11: keep only what a temporary outage needs, so the mirror
cannot approach Convex's limits.** The mirror carries the four published files and
nothing else.

This is already the case today and must stay that way: `trends.json` publishes only
`TRENDS_WINDOW_MS` — **3 hours** (`convex/lib/retention.ts:24`). The 14 days in
`HISTORY_RETENTION_MS` is the *retention* of the underlying store, not the size of the
published file, so the mirror never sees it.

The binding rule for *History retention*, which is still unbuilt: whatever long-window
store that design introduces, **the mirror does not carry it.** If retention adds a
separate long-history file, it stays R2-only. During a Cloudflare outage users get
current levels and a 3-hour trend; deep history is unavailable until Cloudflare
returns. That is the correct thing to sacrifice, and it keeps every mirrored document
far below the 1 MB cap.

### Verification results (2026-09-12)

**1. Convex bundles imports from outside `convex/` — CONFIRMED.** A throwaway
`convex/_bundleProbe.ts` importing `buildStations` from `workers/src/stationMapper.ts`
and `computeOverallStatus` from `workers/src/jps.ts` deployed to the dev deployment and
executed:

```
$ npx convex run _bundleProbe:probe
{ "importedFromOutsideConvex": true, "stations": 0, "status": "NORMAL" }
```

The Convex-hosted publisher is therefore viable; the shared modules do not need to be
duplicated or vendored. The probe was deleted and the deployment re-pushed without it.

**2. Typecheck is the real obstacle, not bundling.** `npx convex dev --once` pulls the
whole `workers/` tree into its `tsc` program and fails on Cloudflare ambient globals it
has no types for:

```
workers/src/coordinates.ts:59  TS2304: Cannot find name 'R2Bucket'.
workers/src/syncState.ts:10    TS2304: Cannot find name 'KVNamespace'.
workers/src/cameraSync.ts:151  TS2304: Cannot find name 'Env'.
```

Bundling succeeds with `--typecheck disable`, but shipping that way would blind the
whole Convex deployment to type errors. The fix belongs in the implementation: the
Convex side must import **only** Cloudflare-free modules (`jps.ts`, `stationMapper.ts`,
`cameraLinks.ts`, `stationCameras.ts` and the shared `convex/` primitives), with the
platform-bound ones (`coordinates.ts`, `syncState.ts`, `cameraSync.ts`, `trends.ts`,
`publish.ts`) reached through a narrow port interface. That is a healthy constraint —
it is the same seam `workers/src/shared.ts` already enforces in the other direction —
but it is real work and must not be estimated as zero.

**3. The Convex account is over its free plan limits — on Data egress only, and the
migration fixes it.** Every CLI invocation prints `Your projects are above the Free
plan limits`. The owner confirmed (2026-09-11) that the meter over quota is **Data
egress**, and the cause is visible in the repo: `origin/main` — the currently deployed
frontend — reads Convex at runtime from six modules (`src/lib/convexClient.ts`,
`src/routes/__root.tsx`, and the four data hooks). Every live visitor is billed egress.

This branch has **zero** runtime Convex reads, so Phase 6 collapses that egress to
approximately nothing as soon as the frontend flips to R2. **The overage resolves
itself at cutover; it is not a blocker for the mirror.**

*Recorded because it is the mirror's own meter.* Data egress is exactly what a
read-serving mirror consumes, so the headroom is worth stating rather than assuming:

- *Mirror mode (steady state):* reads come **from** R2, which is Convex ingress and
  free; writes go to Convex's own database, which meters as Database I/O rather than
  egress. Egress ≈ 0.
- *Outage mode:* the mirror serves real users at ~212 KB per cold load, so the 1 GB
  free tier is roughly 4,900 cold loads per month. ETag revalidation makes repeat polls
  304s, which are negligible. Comfortable at current traffic; the thing that would
  break it is a flood-day spike, which is the same exposure already accepted for
  `r2.dev` being uncached.

The earlier framing of this as the finding that "most threatens the design" was written
before the meter was known and is withdrawn.

### Open questions

1. **Where does the publisher run?** Mirroring on Convex is settled. The full
   JPS→snapshot publish could run there — now confirmed possible — or on GitHub Actions
   with the identical `workers/src` code. Actions still avoids the typecheck seam in
   finding 2 entirely, so this remains genuinely open.
2. **`syncState` in standby mode.** The Worker keeps it in KV. Convex already has a
   `syncState` table (`convex/schema.ts:87`), currently empty, which is the natural home
   — but the two stores then diverge, and on failback the Worker rebuilds once from a
   stale fingerprint. Harmless, worth stating.
3. **Split-brain on `trends.json`.** It is read-modify-write. If both publishers ever
   run at once the later write silently drops the other's readings. The 45-minute
   threshold makes overlap unlikely; it does not make it impossible.
4. **Interaction with history retention.** See the 1 MB document cap above.

## Rollback

**Corrected 2026-09-09.** This section previously read "both backends write the same
R2 keys, so cutover is reversible: set `CRONS_ENABLED=true` on Convex and disable the
Worker crons." That is no longer true and must not be relied on. The keys still match,
but the *contents* do not: Convex emits document IDs over 270 station docs, the Workers
emit JPS ids over a deduplicated set (see *Convex as a standby publisher* above).
Flipping `CRONS_ENABLED` would republish the old contract under the new frontend and
break routing, favorites and notification tags.

Rollback is therefore **frontend-side**: point `VITE_SNAPSHOT_BASE_URL` back at the
last good snapshot, or redeploy the pre-migration frontend that reads Convex directly.
Since the production bucket is empty until cutover, Phase 6 is a first write rather
than a swap — Convex keeps serving the live site until the env var flips, which is the
safe ordering.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| ~~JPS blocks or rate-limits Cloudflare IPs~~ | **Resolved** — Phase 0: 11/12 from the edge vs 12/12 local; the `8c7fded` note was a timeout, not a block | none needed |
| ~~`http://` fetch unavailable from Workers~~ | **Resolved** — Phase 0: 200 `image/jpeg` from the edge; upstream is HTTPS since `23165d2` | Use HTTPS and retry; **never** downgrade to `http://` on failure |
| ~~Build exceeds 10 ms CPU~~ | **Resolved** — Phase 5 soak: 491 invocations over 71 h on a real free-plan account, zero `exceededCpu` | none needed; the chained-Worker split is dropped |
| JPS connect stalls ~20 s on ~40% of attempts | **High — observed** | Fetch districts in parallel, not sequentially; explicit retry budget well inside the 15-minute cron wall clock; withhold the fingerprint when any district failed so the next run retries |
| KV write cap (1,000/day) | Low | 288/day projected; move `syncState` to an R2 key if it ever tightens |
| Migration silently drops the 14 d history `3941656` preserved | **High** if unaddressed | Design the history store before Phase 6 — see *History retention* |
| Cron drift or missed runs | **High — measured: 14% of windows never fire; worst observed outage 3.5 h, both Workers together** | Free-plan best-effort scheduling; not fixable in our code. Owner decision before Phase 6: accept / Workers Paid / standby publisher — see *Soak result*. UI banner already degrades correctly; operator still needs the dead-man's switch |
| Silent staleness: writer dies and nobody is told | **High — observed** (2 days stale with `status:"ok"`) | Off-Cloudflare GitHub Actions watchdog on `syncedAt` age; never alert on `status` |
| `r2.dev` rate-limits under flood-day traffic | Medium | **Accepted 2026-09-04** — no custom domain, traffic out of scope; revisit before flood season |
