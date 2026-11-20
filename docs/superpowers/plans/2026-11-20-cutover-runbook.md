# Cutover runbook — Convex → Cloudflare Workers (#67, Phase 6)

Every Phase 6 blocker is cleared as of 2026-11-20 (history store, watchdog, CORS, live
push check, click-through). This is the order to switch in. Each step is safe to stop
after: until step 5 the live site still reads Convex and nothing user-facing changes.

Production values:

| Thing | Value |
|---|---|
| Bucket | `riverlevel-snapshot` |
| Public URL | `https://pub-1851f7bcd6404990ac28a743e0d6ed73.r2.dev` |
| KV namespace `SYNC_STATE` | `31e6a882557141a9aaa3484686697cb8` (created 2026-11-20) |
| Workers | `wl-sync` (`workers/wrangler.toml`), `wl-cameras` (`workers/wrangler.cameras.toml`) |

## 1. Free a cron slot budget — stop staging

The free plan allows **5 cron triggers per account**. Staging holds 3; production needs
3. Staging's `crons` are now `[]`, so redeploying staging releases them:

```
cd workers
npx wrangler deploy --env staging
npx wrangler deploy --env staging --config wrangler.cameras.toml
```

## 2. Deploy production Workers

```
npx wrangler deploy
npx wrangler deploy --config wrangler.cameras.toml
npx wrangler secret put ONESIGNAL_APP_ID
npx wrangler secret put ONESIGNAL_REST_API_KEY
```

The bucket is empty, so this is a first write, not a swap. Nothing reads it yet.

## 3. Verify the first publish (≤ 15 min, cron is best-effort)

```
curl -s https://pub-1851f7bcd6404990ac28a743e0d6ed73.r2.dev/meta.json
curl -s https://pub-1851f7bcd6404990ac28a743e0d6ed73.r2.dev/stations.json | jq '.items | length'   # ~150
```

`stations.json` only appears on a run where JPS has changed.

**Seed `cameras.json`.** The camera roster is built only by the weekly metadata cron
(`0 2 * * SUN`); the 15-min mirror just refreshes frames for cameras already in it. An
empty bucket would show no cameras until Sunday, so copy staging's roster once — it
is the same JPS data:

```
npx wrangler r2 object get riverlevel-snapshot-dev/cameras.json --remote --file /tmp/cameras.json
npx wrangler r2 object put riverlevel-snapshot/cameras.json --remote --file /tmp/cameras.json \
  --content-type application/json
```

The next mirror run then fills `cam/{id}.jpg`, and Sunday's run replaces the roster.

## 4. Convex standby prerequisites (Convex dashboard → production → env)

- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` set, and
  `R2_BUCKET=riverlevel-snapshot`. Without them the standby publisher cannot cover
  Worker cron blackouts.
- `CRONS_ENABLED` **unset**. `main` today has no such gate; once this branch deploys,
  the legacy Convex pipeline stops unless it is `true`. That is the intent.

## 5. Switch the frontend

1. Netlify → Site configuration → Environment variables:
   `VITE_SNAPSHOT_BASE_URL = https://pub-1851f7bcd6404990ac28a743e0d6ed73.r2.dev`
   (all contexts — CORS allows the site and its `*--riverlevel.netlify.app` previews).
2. Merge #64 (`feat/r2-snapshot-read-path` → `main`). Netlify rebuilds; the Convex
   deploy workflow pushes the gated crons + standby.
3. Load https://riverlevel.netlify.app — stations, detail, cameras, offline.

## 6. Arm the watchdog

GitHub → Settings → Secrets and variables → Actions → Variables:
`SNAPSHOT_BASE_URL = https://pub-1851f7bcd6404990ac28a743e0d6ed73.r2.dev`.
Telegram secrets are already set (Hermes group, General topic). Run it once by hand
from the Actions tab to confirm it is quiet.

## 7. Re-subscribe

Old subscriptions are tagged with Convex ids; the Worker alerts on JPS ids. Remove the
old `station_<convex id>` tags (OneSignal → Audience) and re-tap the bell on each
watched station in the new app. The owner is the only subscriber.

## 8. Watch for a week, then Phase 7

Watch: GraphQL CPU / errors for `wl-sync`, the watchdog, and `meta.json` `publisher`
(`standby` means the Worker cron went quiet and Convex covered it).

## Rollback

Unset `VITE_SNAPSHOT_BASE_URL` is **not** a rollback — the new frontend has no Convex
read path. Roll back by reverting the #64 merge on `main` and setting Convex
`CRONS_ENABLED=true`. The Workers can keep running; nothing reads their bucket.
