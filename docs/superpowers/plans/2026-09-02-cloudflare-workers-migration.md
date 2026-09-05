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

- **`wl-sync`** — `*/5 * * * *` water levels; `0 2 * * 0` weekly camera metadata
- **`wl-cameras`** — `*/5 * * * *`, mirrors a rotating 1/3 slice of cameras
  (~31 per run, full cycle every 15 min). The slice is derived from the clock
  (`floor(now / 5min) % 3`), so no cursor needs storing.

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
| 3 | Does the build fit in 10 ms CPU? | **Deferred to Phase 5** — measured p95 4.79 ms locally |

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

### Phase 4 — Metadata and notifications

- Weekly camera metadata refresh -> `cameras.json`.
- Station metadata comes from the district fetches; no separate weekly station job.
- Danger notifications: check KV `notif:{stationId}`, POST OneSignal, set the key with
  a 1 h TTL. Preserve the "skip if data older than 45 minutes" staleness guard.

### Phase 5 — Staging verification

- Point the Workers at a **staging bucket prefix**, never production.
- Run a local frontend against it via `VITE_SNAPSHOT_BASE_URL` and click through.
- Soak for 24 h; confirm cron actually fires every 5 min.
- **Measure CPU here** (carried over from Phase 0, question 3). `wrangler tail` on the
  staging deployment, on a real free-plan account — a temporary preview account does
  not enforce the 10 ms cap and cannot answer this. Local measurement predicts p95
  ~4.8 ms; if the real figure is materially worse, split the raw dump and the build
  across two chained Workers before cutover.

### Phase 6 — Cutover

- Repoint the Workers at the production bucket.
- Leave Convex deployed but dormant (`CRONS_ENABLED` unset).
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

## Rollback

Both backends write the same R2 keys, so cutover is reversible: set
`CRONS_ENABLED=true` on Convex and disable the Worker crons. Convex stays deployed
but dormant until Phase 7, so rollback is a config change, not a redeploy.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| ~~JPS blocks or rate-limits Cloudflare IPs~~ | **Resolved** — Phase 0: 11/12 from the edge vs 12/12 local; the `8c7fded` note was a timeout, not a block | none needed |
| ~~`http://` fetch unavailable from Workers~~ | **Resolved** — Phase 0: 200 `image/jpeg` from the edge; upstream is HTTPS since `23165d2` | Use HTTPS and retry; **never** downgrade to `http://` on failure |
| Build exceeds 10 ms CPU | Low — measured p95 4.79 ms of a 10 ms budget | Confirmed at Phase 5 via `wrangler tail`, not before; build only on fingerprint change (~1/3 of runs); no gzip; if it ever tightens, split raw-dump and build across two chained Workers |
| JPS connect stalls ~20 s on ~40% of attempts | **High — observed** | Fetch districts in parallel, not sequentially; explicit retry budget well inside the 15-minute cron wall clock; withhold the fingerprint when any district failed so the next run retries |
| KV write cap (1,000/day) | Low | 288/day projected; move `syncState` to an R2 key if it ever tightens |
| Migration silently drops the 14 d history `3941656` preserved | **High** if unaddressed | Design the history store before Phase 6 — see *History retention* |
| Cron drift or missed runs | Low | `meta.json` surfaces staleness in the UI banner, but that informs visitors, not the operator — needs the dead-man's switch above |
| Silent staleness: writer dies and nobody is told | **High — observed** (2 days stale with `status:"ok"`) | Off-Cloudflare GitHub Actions watchdog on `syncedAt` age; never alert on `status` |
| `r2.dev` rate-limits under flood-day traffic | Medium | **Accepted 2026-09-04** — no custom domain, traffic out of scope; revisit before flood season |
