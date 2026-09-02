# Migrate the sync pipeline from Convex to Cloudflare Workers

**Status:** proposed
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
| `waterLevelHistory` (3 h trends) | `trends.json` in R2; read-append-prune-write on changed runs only |
| `syncState` | One KV key (~288 writes/day, under the 1,000/day free cap) |
| `notificationLog` | KV key per station with a 1 h TTL — the cooldown expires itself |
| `notifyDangerForStation` | One POST to OneSignal, unchanged (subscriber state already lives in OneSignal tags) |

### Upstream endpoints

- Summary: `https://infobanjirjps.selangor.gov.my/JPSAPI/api/StationRiverLevels/GetWLStationSummary`
- Per district: `.../GetWLAllStationData/{districtId}`
- CCTV frames: `http://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image/{id}.jpg` (**plain http**)

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

### Phase 0 — Feasibility spike (BLOCKING, do this first)

A throwaway deployed Worker that answers only the questions local tooling cannot.
`wrangler dev` runs on the developer's machine with the developer's IP, so a local
pass proves nothing about any of these.

1. **Does JPS accept Cloudflare IPs?** Fetch the summary endpoint from a deployed
   Worker. Prior art is discouraging: commit `8c7fded` on `main` notes "Convex
   cannot reach JPS API" for the coordinates endpoint, so upstream is fussy about
   callers.
2. **Does `fetch()` to plain `http://` work from the edge?** The CCTV base URL is
   not HTTPS. Confirm a frame downloads with an `image/*` content-type.
3. **Does the build fit in 10 ms CPU?** Parse 10 JPS responses, build ~200 stations,
   stringify ~212 KB. Measure with `wrangler tail` / the dashboard CPU-time metric.
   Miniflare does not enforce CPU limits, so this cannot be checked locally.

**Exit criteria:** all three pass, or we take the fallback below. Nothing else in
this plan starts until Phase 0 reports.

**Fallback if any spike fails:** a scheduled GitHub Action (free and unlimited on
public repos, full Node, no CPU cap) running the sync with the existing aws4fetch R2
client almost verbatim. Not preferred — GitHub Actions cron is frequently delayed
5-15 minutes, which is poor for a flood-alert app — but it is a proven escape hatch,
and reaching it costs a day rather than a week.

### Phase 1 — Scaffold and port shared logic

- Add `wrangler.toml`, `@cloudflare/vitest-plugin`, R2 + KV bindings; a `workers/` dir.
- Move the Convex-free pure modules across unchanged: `changeDetection.ts`,
  `jpsDate.ts`, `snapshotBuilder.ts`, `fetchWithRetry.ts`, and their tests.
- Drop `concurrency.ts` (`runWithConcurrency`) and the aws4fetch `r2.ts` — the Worker
  uses the native R2 binding, so no request signing and no manual concurrency pool.
- Drop gzip from the plan entirely: it existed to shrink Convex egress, and R2 egress
  is free.

**Verify:** existing 134 tests still green.

### Phase 2 — `wl-sync` water level Worker

Port `updateWaterLevels` to a `scheduled()` handler, preserving all existing
resilience behaviour:

- summary fetch failure aborts the run and records `upstream_error`
- fingerprint match short-circuits before the district fetches
- per-district failures warn and continue; all-districts-failed is an outage
- the fingerprint is withheld when any district failed, so the next run retries
- `syncState` is read before the data and `meta.json` written last, so meta never
  describes data that was not published

**Verify:** golden-file equivalence test (below) plus Worker integration tests.

### Phase 3 — `wl-cameras` mirror Worker

- Clock-derived 1/3 slice; assert the three slices partition all 92 cameras exactly.
- Keep the existing guards: skip mirroring while `syncState` says JPS is unreachable,
  and abort after 10 consecutive failures.
- Re-publish `cameras.json` after a successful slice so `captured_at` stays current.

### Phase 4 — Metadata and notifications

- Weekly camera metadata refresh -> `cameras.json`.
- Station metadata comes from the district fetches; no separate weekly station job.
- Danger notifications: check KV `notif:{stationId}`, POST OneSignal, set the key with
  a 1 h TTL. Preserve the "skip if data older than 45 minutes" staleness guard.

### Phase 5 — Staging verification

- Point the Workers at a **staging bucket prefix**, never production.
- Run a local frontend against it via `VITE_SNAPSHOT_BASE_URL` and click through.
- Soak for 24 h; confirm cron actually fires every 5 min and CPU stays under 10 ms.

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

Baseline today: **20 test files, 134 tests passing**. CI already runs `npm run test`
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

- JPS accepting Cloudflare IPs — needs a real deploy (Phase 0).
- `http://` CCTV fetch from the edge — needs a real deploy (Phase 0).
- The 10 ms CPU limit — Miniflare does not enforce it; needs `wrangler tail` on a
  real deployment (Phase 0).

## Rollback

Both backends write the same R2 keys, so cutover is reversible: set
`CRONS_ENABLED=true` on Convex and disable the Worker crons. Convex stays deployed
but dormant until Phase 7, so rollback is a config change, not a redeploy.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| JPS blocks or rate-limits Cloudflare IPs | Medium — prior art shows Convex was blocked on one endpoint | Phase 0 spike; GitHub Actions fallback |
| `http://` fetch unavailable from Workers | Medium | Phase 0 spike; try HTTPS on the CCTV host; fallback |
| Build exceeds 10 ms CPU | Medium | Only build on fingerprint change (~1/3 of runs); no gzip; if still over, split raw-dump and build across two chained Workers |
| KV write cap (1,000/day) | Low | 288/day projected; move `syncState` to an R2 key if it ever tightens |
| Cron drift or missed runs | Low | `meta.json` already surfaces staleness in the UI banner |
