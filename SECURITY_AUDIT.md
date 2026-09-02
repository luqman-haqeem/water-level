# Security Audit — `luqman-haqeem/water-level`

**Scope:** full repository at commit `c023497` (branch `main`)
**Stack:** React 18 + Vite 6 SPA (TanStack Router), Convex backend, Netlify functions/edge functions, OneSignal push, PostHog analytics
**Assessed:** 2 Sep 2026

## Executive summary

The application has **no authentication or authorization layer of any kind**. `ctx.auth.getUserIdentity()` appears zero times; there is no `convex/auth.config.ts`, no auth provider, and no `users` table. For a read-only public-data app that is a defensible design — but **9 of the 23 public Convex functions write to the database or trigger outbound work**, and in Convex every `mutation`/`action` is an internet-reachable endpoint. The deployment URL is shipped to browsers in the client bundle as `VITE_CONVEX_URL`, so it is not a secret and cannot serve as an access control.

The most serious consequence is not ordinary data vandalism. Because flood alert levels are derived from per-station threshold fields (`convex/waterLevelData.ts:42-64`), an anonymous attacker can rewrite the `dangerWaterLevel` / `warningWaterLevel` / `alertWaterLevel` of any real monitoring station and thereby **suppress or fabricate flood danger alerts** — including the push notifications this app sends to subscribers' phones. This is a public-safety integrity issue.

Encouraging signs: no hardcoded secrets anywhere in the repo or git history, a correct `.gitignore`, an `.env.example` containing only placeholders, no XSS sinks (`dangerouslySetInnerHTML`/`eval`/`innerHTML` all absent), no SQL (document DB with server-side validators), and the codebase clearly *knows* the right pattern — `convex/waterLevelData.ts:164-166` even carries the comment *"Internal-only to prevent unauthenticated writes"*. The defect is that the pattern was applied inconsistently.

| Severity | Count |
|---|---|
| Critical | 2 |
| High | 4 |
| Medium | 7 |
| Low | 5 |

### Root cause

`convex/crons.ts:22,29,36` registers the three sync entry points through the **public** `api.*` namespace, which forced them to be declared `action` instead of `internalAction`. Contrast `convex/crons.ts:43`, which correctly uses `internal.*`. Crons can call internal functions — so this is a one-word fix per cron that closes most of the exposed surface.

---

## CRITICAL

### C-1 — Unauthenticated arbitrary station overwrite → flood alert threshold tampering

**Severity:** Critical (CVSS ~9.1 — AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:H/A:H)
**Location:** `convex/sync/stationUpdater.ts:117` (`createStation`), reaching `ctx.db.patch` at `convex/sync/stationUpdater.ts:182`

**Evidence.** `createStation` is a **public** `mutation` with no identity check. It forwards straight into the internal `upsertStation`, whose lookup is keyed on the attacker-supplied `jpsSelId`:

```ts
// convex/sync/stationUpdater.ts:176-186
const existing = await ctx.db
  .query("stations")
  .withIndex("by_jps_sel_id", (q) => q.eq("jpsSelId", stationData.jpsSelId))
  .first();

if (existing) {
  await ctx.db.patch(existing._id, { ...stationData, districtId });   // ← overwrite
}
```

Despite its name, this is not "create" — supplying an **existing** `jpsSelId` takes the `patch` branch. It is an **arbitrary-station-overwrite primitive** reachable by anyone with the public deployment URL:

```bash
curl -X POST https://<deployment>.convex.cloud/api/mutation \
  -H 'Content-Type: application/json' \
  -d '{"path":"sync/stationUpdater:createStation","args":{
        "districtId":"<any districtId from the public getDistricts query>",
        "stationData":{"jpsSelId":"153","stationName":"Sungai Klang",
                       "stationStatus":true,"dangerWaterLevel":9999}}}'
```

**Impact chain.** `computeAlertLevel` (`convex/waterLevelData.ts:42-64`) falls back to threshold comparison, and `upsertCurrentLevel` (`convex/sync/waterLevelUpdater.ts:268`) fires the danger push only when `alertLevel === 3`. Setting `dangerWaterLevel: 9999` therefore **permanently silences danger alerts for that station**; setting it to `0` makes every station report DANGER, destroying trust in the alert channel. An attacker can also relocate stations (`latitude`/`longitude`), rename them, or mark them offline (`stationStatus: false`) to hide them from the UI. Two sibling public mutations compound this: `createDistrict` (`:94`) allows unbounded junk-row insertion, and `getAllDistricts` (`:111`) is a read declared as a `mutation`, so it bypasses query caching and serializes against the DB.

**Note:** `scripts/scrapeWaterLevel.js:4` states *"This script uses public Convex mutations that have been removed for security."* That remediation was started but **not finished** — `createStation`, `createCamera`, `createDistrict`, and `getAllDistricts` are all still public.

**Remediation.** Convert to internal functions and delete the public wrappers. `createStation` exists only as a public shim around `upsertStation`, so it can be removed outright.

```diff
--- a/convex/sync/stationUpdater.ts
+++ b/convex/sync/stationUpdater.ts
-import { action, internalMutation, mutation } from "../_generated/server";
+import { internalAction, internalMutation } from "../_generated/server";

-export const updateStations = action({
+export const updateStations = internalAction({

-// Public mutation for seeding/manual district insertion
-export const createDistrict = mutation({
+export const createDistrict = internalMutation({
   args: { name: v.string(), jpsDistrictsId: v.number() },

-export const getAllDistricts = mutation({
-  handler: async (ctx) => {
-    return await ctx.db.query("districts").collect();
-  },
-});
-
-export const createStation = mutation({
-  args: { districtId: v.id("districts"), stationData: v.object({ /* ... */ }) },
-  handler: async (ctx, { districtId, stationData }): Promise<void> => {
-    await ctx.runMutation(internal.sync.stationUpdater.upsertStation, {
-      districtId, stationData,
-    });
-  },
-});
+// createStation/getAllDistricts removed — use `npx convex run` against the
+// internal upsertStation, or the Convex dashboard, for manual seeding.
```

Also replace `jpsSelId: v.any()` with `v.string()` at lines `121` and `153` (see M-4), and update `convex/crons.ts:29` to `internal.sync.stationUpdater.updateStations`.

---

### C-2 — Unauthenticated arbitrary camera overwrite (stored attacker-controlled URL + camera suppression)

**Severity:** Critical (CVSS ~8.2)
**Location:** `convex/sync/cameraUpdater.ts:102` (`createCamera`), reaching `ctx.db.patch` at `convex/sync/cameraUpdater.ts:151`

**Evidence.** Identical insert-or-patch pattern, keyed on the caller's `jpsCameraId`, exposed as a public `mutation` with no auth check:

```ts
// convex/sync/cameraUpdater.ts:145-155
const existing = await ctx.db
  .query("cameras")
  .withIndex("by_jps_camera_id", (q) => q.eq("jpsCameraId", cameraData.jpsCameraId))
  .first();
if (existing) {
  await ctx.db.patch(existing._id, { ...cameraData, districtId });
}
```

**Impact.**
- `isEnabled: v.boolean()` is attacker-controlled. Setting `false` **removes a camera from every client**, since all read paths filter on `by_enabled` (`convex/cameras.ts:10`, `convex/stations.ts:26`). Setting `true` on a camera an operator deliberately disabled re-exposes it.
- `imgUrl` and `cameraName` are attacker-controlled strings persisted and served to all users. `imgUrl` is currently not rendered (the UI builds its own proxy path at `src/components/CameraCard.tsx:37`), but it *is* returned to clients by `convex/cameras.ts:31` and `convex/stations.ts:68`, so this is a **latent stored-injection sink** that becomes live the moment any consumer renders `img_url` directly.
- `jpsCameraId` is attacker-controlled and flows into the proxy URL, chaining into H-3.

**Remediation.** Same treatment — delete the public wrapper, keep only `upsertCamera` as `internalMutation`:

```diff
--- a/convex/sync/cameraUpdater.ts
+++ b/convex/sync/cameraUpdater.ts
-import { action, internalMutation, mutation } from "../_generated/server";
+import { internalAction, internalMutation } from "../_generated/server";

-export const updateCameras = action({
+export const updateCameras = internalAction({

-export const createCamera = mutation({
-  args: { districtId: v.id("districts"), cameraData: v.object({ /* ... */ }) },
-  handler: async (ctx, { districtId, cameraData }): Promise<void> => {
-    await ctx.runMutation(internal.sync.cameraUpdater.upsertCamera, { districtId, cameraData });
-  },
-});
-
-export const getCameras = internalMutation({      // dead debug code, .take(5)
-  handler: async (ctx) => await ctx.db.query("cameras").take(5),
-});
```

Then update `convex/crons.ts:36` to `internal.sync.cameraUpdater.updateCameras`.

---

## HIGH

### H-1 — Public sync actions: unauthenticated resource amplification and third-party API abuse

**Severity:** High
**Location:** `convex/sync/waterLevelUpdater.ts:84`, `convex/sync/stationUpdater.ts:5`, `convex/sync/cameraUpdater.ts:5`; registered publicly at `convex/crons.ts:22,29,36`

**Evidence.** All three are public `action`s taking **no arguments** and requiring no auth, so a single unauthenticated HTTP request replays the entire 15-minute sync pipeline on demand:

```bash
curl -X POST https://<deployment>.convex.cloud/api/action \
  -H 'Content-Type: application/json' \
  -d '{"path":"sync/waterLevelUpdater:updateWaterLevels","args":{}}'
```

One call to `updateWaterLevels` performs `1 + N` outbound fetches to the Malaysian government JPS API (`convex/sync/waterLevelUpdater.ts:96,142`) and, per district, an `upsertStation` + `upsertCurrentLevel` transaction that **inserts a `waterLevelHistory` row per station** (`convex/sync/waterLevelUpdater.ts:303-309`). Consequences of an attacker looping this:

1. **Cost/quota exhaustion** — unbounded Convex function-call, bandwidth, and storage consumption billed to the project owner.
2. **Outbound DoS by proxy** — the deployment floods `infobanjirjps.selangor.gov.my` from its own IP, risking IP-blocking of the app's only data source (a full availability outage) and implicating the owner in traffic abuse against a government service.
3. **Storage amplification** — `waterLevelHistory` grows per invocation, while cleanup is rate-limited to 250 × 8 = 2000 rows per 4-hour cron run (`convex/sync/waterLevelUpdater.ts:320-322`). Writes can be driven faster than deletes.
4. **Real push notifications to real devices** — `upsertCurrentLevel` (`convex/sync/waterLevelUpdater.ts:291-296`) schedules `notifyDangerForStation`. The only brakes are a 1-hour per-station cooldown (`convex/notifications.ts:18-35`) and a 45-minute staleness gate (`:274-277`). Combined with C-1's threshold control, an attacker can drive genuine "Danger Level Alert" pushes to subscribers.

**Remediation.** Make all three internal and reference them via `internal.*` in crons. Nothing else calls them.

```diff
--- a/convex/crons.ts
+++ b/convex/crons.ts
-import { api, internal } from "./_generated/api";
+import { internal } from "./_generated/api";

-crons.interval("update water levels", { minutes: 15 },
-    api.sync.waterLevelUpdater.updateWaterLevels);
+crons.interval("update water levels", { minutes: 15 },
+    internal.sync.waterLevelUpdater.updateWaterLevels);

-crons.weekly("sync station details", { dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
-    api.sync.stationUpdater.updateStations);
+crons.weekly("sync station details", { dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
+    internal.sync.stationUpdater.updateStations);

-crons.weekly("update cameras", { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
-    api.sync.cameraUpdater.updateCameras);
+crons.weekly("update cameras", { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
+    internal.sync.cameraUpdater.updateCameras);
```

Manual triggering still works: `npx convex run sync.waterLevelUpdater.updateWaterLevels`.

---

### H-2 — Completed one-shot migration mutations left publicly callable

**Severity:** High
**Location:** `convex/stations.ts:235` (`migrateJpsSelIdToString`), `convex/seedCoordinates.ts:132` (`seedCoordinatesFromHardcoded`)

**Evidence.** Both are argument-less public `mutation`s whose own docstrings say they are dashboard-only one-time migrations — `convex/stations.ts:232` literally instructs *"and remove this function."* Neither was removed.

- `migrateJpsSelIdToString` (`:236`) does `ctx.db.query("stations").collect()` then patches in a loop — an unauthenticated full-table read+write amplification primitive, callable repeatedly.
- `seedCoordinatesFromHardcoded` (`:132`) patches lat/lng on 81 stations from an August-2025 hardcoded array, **reverting any corrected coordinates**. Since `convex/waterLevelData.ts:127-130` deliberately preserves stored coordinates because "JPS removed lat/lng from their API," this silently destroys the current source of truth for station positions — mislocating flood stations on the map.

**Remediation.** Delete both. If retained for operational reasons, convert to `internalMutation` and invoke via `npx convex run` / the dashboard, which is how the docstrings already describe running them.

```diff
--- a/convex/stations.ts
+++ b/convex/stations.ts
-import { query, mutation, internalMutation } from "./_generated/server";
+import { query } from "./_generated/server";
-
-export const migrateJpsSelIdToString = mutation({ /* one-time migration */ });
+// Migration completed and removed. Recover from git history if ever needed.
```

```diff
--- a/convex/seedCoordinates.ts
+++ b/convex/seedCoordinates.ts
-import { internalMutation, mutation } from "./_generated/server";
+import { internalMutation } from "./_generated/server";
-export const seedCoordinatesFromHardcoded = mutation({
+export const seedCoordinatesFromHardcoded = internalMutation({
```

---

### H-3 — SSRF / open proxy via path traversal in the image proxy

**Severity:** High
**Location:** `netlify/functions/proxy-image.ts:23`

**Evidence.** The `id` value is taken from the query string or the trailing path segment (`:5-14`) and interpolated into an outbound URL with **no validation and no allowlist check** against the `cameras` table:

```ts
const imageUrl = `http://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image/${id}.jpg`;
const response = await fetch(imageUrl);
```

I verified WHATWG URL normalization makes both the directory and the `.jpg` suffix escapable — `..` segments are collapsed, and a bare `?` pushes the suffix into the query string:

| Attacker `id` | Resulting request |
|---|---|
| `../../../../admin/login.aspx?` | `path=/admin/login.aspx` `query=?.jpg` |
| `../../../../InfoBanjir.WebAdmin/web.config?` | `path=/InfoBanjir.WebAdmin/web.config` `query=?.jpg` |
| `../../../../etc/x#` | `path=/etc/x` (suffix in fragment, never sent) |

So `GET /api/proxy-image/../../../../web.config%3F` retrieves **any path on the upstream host** and returns the bytes to the attacker base64-encoded under a forged `Content-Type: image/jpeg` (`:38-45`). Because the host component is fixed, this is a host-constrained SSRF rather than a full one — but it still yields:

- **Unauthenticated open relay / reconnaissance** against a Malaysian government host, with the app's Netlify IP as the origin. Attribution and any resulting abuse complaints land on the app owner.
- **Bandwidth/memory amplification** — no `Content-Length` check and no timeout; the whole body is buffered via `arrayBuffer()` then base64-expanded ~33% in Lambda memory (`:37-38`).
- **Cleartext `http://`** upstream, so proxied content is MITM-modifiable in transit and the app launders it to users over its own HTTPS origin.
- Chains with C-2: `jpsCameraId` is attacker-writable, so a malicious value can be planted in the DB and served to *other* users, not just requested directly.

**Remediation.** Validate strictly, force TLS, and bound the response.

```ts
import type { Handler, HandlerEvent } from "@netlify/functions";

const MAX_BYTES = 5 * 1024 * 1024;
const UPSTREAM = "https://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image";

const handler: Handler = async (event: HandlerEvent) => {
    let id = event.queryStringParameters?.id;
    if (!id) {
        const segments = event.path.split("/").filter(Boolean);
        const last = segments[segments.length - 1];
        if (last && last !== "proxy-image") id = last;
    }

    // Allow only bare numeric camera IDs — blocks traversal, ?/#, and encoded payloads.
    if (!id || !/^\d{1,10}$/.test(id)) {
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid camera ID" }) };
    }

    try {
        const upstream = await fetch(`${UPSTREAM}/${id}.jpg`, {
            signal: AbortSignal.timeout(10_000),
            redirect: "error",                       // don't follow off-host redirects
        });
        if (!upstream.ok) {
            return { statusCode: 502, body: JSON.stringify({ error: "Upstream error" }) };
        }

        const type = upstream.headers.get("content-type") ?? "";
        if (!type.startsWith("image/")) {           // refuse non-image bodies
            return { statusCode: 502, body: JSON.stringify({ error: "Unexpected content type" }) };
        }

        const buffer = await upstream.arrayBuffer();
        if (buffer.byteLength > MAX_BYTES) {
            return { statusCode: 502, body: JSON.stringify({ error: "Image too large" }) };
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "image/jpeg",
                "Cache-Control": "public, max-age=300",
                "X-Content-Type-Options": "nosniff",
            },
            body: Buffer.from(buffer).toString("base64"),
            isBase64Encoded: true,
        };
    } catch {
        return { statusCode: 502, body: JSON.stringify({ error: "Failed to fetch image" }) };
    }
};

export { handler };
```

If the upstream genuinely has no valid TLS certificate, keep `http://` but document the accepted risk explicitly — do not silently ship cleartext.

---

### H-4 — OG image endpoint: unvalidated SSRF sink plus alert-level content spoofing

**Severity:** High
**Location:** `netlify/edge-functions/og-image.tsx:271,281,309` (SSRF); `:265-270,308,338` (spoofing); `:231` (hardcoded deployment URL)

**Evidence.** Every value rendered into the social-preview card is read straight from attacker-controllable query parameters and used without validation:

```ts
// netlify/edge-functions/og-image.tsx:265-271
const stationName   = url.searchParams.get('name')     || "Unknown Station";
const district      = url.searchParams.get('district') || "Unknown District";
const fallbackAlert = url.searchParams.get('alert')    || "0";
const cameraUrl     = url.searchParams.get('camera')   || null;
...
// :309
<img src={cameraUrl} alt="Live Camera" style={STYLES.cameraImage} />
```

1. **SSRF (`camera` parameter).** `ImageResponse` renders server-side in the Deno edge runtime, so `<img src={cameraUrl}>` causes the **edge function to fetch an arbitrary attacker-supplied URL** with no scheme, host, or protocol restriction. `GET /og/station/x?cameraEnabled=true&camera=http://169.254.169.254/latest/meta-data/` targets link-local/internal addresses from inside the hosting network; it also works as a blind request forger and a cache/latency amplifier.
2. **Alert-level spoofing → misinformation.** The real-data fetch at `:246` is best-effort and returns `null` on any failure, at which point `:275-279` fall back entirely to URL parameters. An attacker can craft `/og/station/<realId>?name=Sungai%20Klang&district=Petaling&alert=3&level=99.9&online=true`, which renders an authentic-looking **red "DANGER" card at 99.90m** under the app's own domain. Shared on social media or messaging apps, this is a credible flood-panic misinformation vector — and the inverse (`alert=0`) can falsely reassure during a genuine emergency. `alert` is used only as a lookup key into `ALERT_COLORS` (`:225`), so it is not an injection risk, but it fully controls the rendered severity.
3. **Infrastructure disclosure.** `:231` hardcodes `https://quick-warbler-518.convex.cloud`, pinning the production deployment identifier in source. Not a credential (the URL also ships in the client bundle), but it should be an env var so dev/prod are not conflated and the OG renderer doesn't query prod from a preview deploy. The `path` it queries — `waterLevelData:getCurrentLevelByStationId` — **does not exist** in `convex/waterLevelData.ts`, so the live-data path is dead and *every* request silently uses the spoofable fallback.

**Remediation.** Derive all displayed values server-side from `stationId`; never trust query parameters for rendered content.

```ts
// Resolve real data from an existing public query, keyed only on the path param.
const convexUrl = Deno.env.get("CONVEX_URL");   // not hardcoded
const res = await fetch(`${convexUrl}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        path: "stations:getStationDetailById",       // a query that actually exists
        args: { stationId },
    }),
});
const station = res.ok ? (await res.json()).value : null;
if (!station) return new Response("Station not found", { status: 404 });

const stationName = station.station_name;
const district    = station.districts.name;
const alertLevel  = station.current_levels?.alert_level ?? "offline";
const currentLevel = station.current_levels?.current_level ?? 0;

// Camera comes from trusted DB state, and is always routed through our own proxy.
const cameraUrl = station.cameras?.jps_camera_id && /^\d+$/.test(station.cameras.jps_camera_id)
    ? `${Deno.env.get("SITE_URL")}/api/proxy-image/${station.cameras.jps_camera_id}`
    : null;
```

Drop the `name`/`district`/`level`/`alert`/`updated`/`online`/`camera`/`cameraEnabled` parameters entirely. If a fallback is still wanted when Convex is unreachable, render a neutral branded card with no alert level rather than a caller-supplied severity.

---

## MEDIUM

### M-1 — Sensitive station telemetry and hardware phone numbers exposed via raw-document queries

**Severity:** Medium
**Location:** `convex/stations.ts:158-163` (`getStationById`), `convex/stations.ts:82-90` (`getStationsByDistrict`), `convex/cameras.ts:49-53` (`getCameraById`), `convex/stations.ts:216-220` (`getCameras`)

**Evidence.** These public queries return **whole documents** with no field projection:

```ts
// convex/stations.ts:158-163
export const getStationById = query({
    args: { stationId: v.id("stations") },
    handler: async (ctx, { stationId }) => {
        return await ctx.db.get(stationId);          // entire document
    },
});
```

Per `convex/schema.ts:11-32` that document includes **`gsmNumber`** — the SIM/telephone number of the field telemetry hardware — plus `batteryLevel`, `mode`, and `z1/z2/z3` device state. The `*WithDetails` queries in the same file hand-project their output and correctly omit these fields, so the exposure is inconsistent rather than intentional. A GSM number tied to unauthenticated critical infrastructure is a direct target for SMS abuse, toll fraud, and social-engineering/command injection against the sensor; `batteryLevel` + `stationStatus` provide reconnaissance for identifying which flood sensors are already degraded.

Separately, `convex/stations.ts:216` returns **all** cameras including `isEnabled: false` — contradicting every other read path, which filters on `by_enabled`. Operators disabling a camera (e.g. one inadvertently overlooking private property) does not actually withhold it.

**Remediation.** Project explicitly, and treat `gsmNumber` as a secret field.

```diff
--- a/convex/stations.ts
+++ b/convex/stations.ts
 export const getStationById = query({
     args: { stationId: v.id("stations") },
     handler: async (ctx, { stationId }) => {
-        return await ctx.db.get(stationId);
+        const station = await ctx.db.get(stationId);
+        if (!station) return null;
+        // Never expose gsmNumber / batteryLevel / mode / z1-z3 to clients.
+        return {
+            _id: station._id,
+            jpsSelId: station.jpsSelId,
+            stationName: station.stationName,
+            stationCode: station.stationCode,
+            refName: station.refName,
+            districtId: station.districtId,
+            latitude: station.latitude,
+            longitude: station.longitude,
+            normalWaterLevel: station.normalWaterLevel,
+            alertWaterLevel: station.alertWaterLevel,
+            warningWaterLevel: station.warningWaterLevel,
+            dangerWaterLevel: station.dangerWaterLevel,
+            stationStatus: station.stationStatus,
+        };
     },
 });

 export const getCameras = query({
     handler: async (ctx) => {
-        return await ctx.db.query("cameras").collect();
+        return await ctx.db.query("cameras")
+            .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
+            .collect();
     },
 });
```

Apply the same projection to `getStationsByDistrict` (`:82`). Longer term, move `gsmNumber` into a separate table that no public query reads, so a future raw-document query cannot re-leak it.

---

### M-2 — No security headers (no CSP, HSTS, X-Frame-Options, or referrer policy)

**Severity:** Medium
**Location:** `netlify.toml:10-13` — the only `[[headers]]` block sets `Cache-Control` for `/assets/*`; a repo-wide grep for `content-security-policy|strict-transport|x-frame-options|referrer-policy|permissions-policy` returns **zero matches**.

**Evidence.** The production site ships no CSP, so there is no defence-in-depth against script injection — relevant because the app persists third-party-derived strings (`cameraName`, `imgUrl`) and renders remote images. No `X-Frame-Options`/`frame-ancestors` means the app can be framed for clickjacking or UI-redress against the notification opt-in prompt. No HSTS means the first navigation is downgrade-attackable. No `Referrer-Policy` leaks full station-detail URLs to third parties. No `X-Content-Type-Options: nosniff` compounds H-3, where non-image bytes are returned labelled as JPEG.

**Remediation.** Add to `netlify.toml`. The CSP below is scoped to what the app actually loads — Convex (WSS + HTTPS), OneSignal SDK/worker, PostHog, Google Fonts, and the same-origin image proxy.

```toml
[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'; script-src 'self' https://cdn.onesignal.com https://*.i.posthog.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.onesignal.com https://*.i.posthog.com; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains; preload"
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "geolocation=(self), camera=(), microphone=(), payment=(), usb=()"
    Cross-Origin-Opener-Policy = "same-origin"
```

Note `geolocation=(self)` is required — `src/hooks/useLocation.ts` uses the Geolocation API. Roll CSP out in `Content-Security-Policy-Report-Only` mode first and check the browser console, since `style-src 'unsafe-inline'` is needed for Tailwind/Radix inline styles and the exact PostHog/OneSignal hosts depend on your configured region.

---

### M-3 — Unbounded array argument enables read amplification DoS

**Severity:** Medium
**Location:** `convex/waterLevelHistory.ts:21-40`

**Evidence.** `stationIds` is an unbounded `v.array(...)`, and the handler runs one full `.collect()` per element in a sequential loop with no cap and no de-duplication:

```ts
args: { stationIds: v.array(v.id("stations")) },
handler: async (ctx, { stationIds }) => {
    for (const stationId of stationIds) {
        const trend = await ctx.db.query("waterLevelHistory")
            .withIndex("by_station_time", (q) =>
                q.eq("stationId", stationId).gte("timestamp", threeHoursAgo))
            .order("asc").collect();          // unbounded rows per station
```

Because duplicates are permitted, a single anonymous request carrying the same valid ID 10,000 times multiplies document reads by 10,000, pushing toward Convex's per-query read limit and inflating bandwidth cost. With 3 hours of 15-minute-interval history the per-station row count is small, but the multiplier is entirely caller-controlled. A related but lower-risk pattern is `getDistrictsWithCounts` (`convex/waterLevelData.ts:213`), which fans out N+1 over all districts × stations and is amplified by the unauthenticated district creation in C-1.

**Remediation.**

```diff
--- a/convex/waterLevelHistory.ts
+++ b/convex/waterLevelHistory.ts
+const MAX_STATIONS_PER_REQUEST = 200;
+const MAX_POINTS_PER_STATION = 60;   // 3h at 15-min cadence, with headroom
+
 export const getMultipleStationsTrend = query({
   args: { stationIds: v.array(v.id("stations")) },
   handler: async (ctx, { stationIds }) => {
     const threeHoursAgo = Date.now() - (3 * 60 * 60 * 1000);
-    const trendsMap: Record<string, any[]> = {};
-    for (const stationId of stationIds) {
+    const uniqueIds = Array.from(new Set(stationIds));
+    if (uniqueIds.length > MAX_STATIONS_PER_REQUEST) {
+      throw new Error(
+        `Too many stations requested (${uniqueIds.length}); max ${MAX_STATIONS_PER_REQUEST}.`
+      );
+    }
+
+    const trendsMap: Record<string, unknown[]> = {};
+    for (const stationId of uniqueIds) {
       const trend = await ctx.db
         .query("waterLevelHistory")
         .withIndex("by_station_time", (q) =>
           q.eq("stationId", stationId).gte("timestamp", threeHoursAgo)
         )
         .order("asc")
-        .collect();
+        .take(MAX_POINTS_PER_STATION);
       trendsMap[stationId] = trend;
     }
     return trendsMap;
   }
 });
```

---

### M-4 — `v.any()` defeats argument validation on a schema-typed field

**Severity:** Medium
**Location:** `convex/sync/stationUpdater.ts:121` and `:153`

**Evidence.** `jpsSelId: v.any()` disables Convex's validator for the field that is the **index key** used for the upsert lookup at `:178`. `convex/schema.ts:12` declares it `v.string()`. Callers can therefore submit a number, boolean, object, or array; combined with C-1 this lets an attacker write values that violate the declared schema, cause type-confusion in the `by_jps_sel_id` lookup, and break the legitimate sync path (which stringifies via `station.id.toString()` in `convex/waterLevelData.ts:110,136`). The `migrateJpsSelIdToString` migration (`convex/stations.ts:235`) exists precisely to clean up this mixed-type state — leaving `v.any()` in place lets it recur.

**Remediation.** After running the migration once, tighten both validators:

```diff
-      jpsSelId: v.any(),
+      jpsSelId: v.string(),
```

Apply at `convex/sync/stationUpdater.ts:121` (`createStation`, if retained) and `:153` (`upsertStation`), and ensure all call sites pass `String(stationJps.id)` — `convex/sync/stationUpdater.ts:39` currently forwards the raw `stationJps.id`, which is a number in the JPS payload.

---

### M-5 — Non-atomic check-then-insert race creates duplicate districts

**Severity:** Medium
**Location:** `convex/waterLevelData.ts:69-91` (`ensureDistrict`), `convex/sync/stationUpdater.ts:96-106` (`createDistrict`)

**Evidence.** Both perform a read, then a conditional insert, with no uniqueness constraint (Convex has none) and — critically — using `.filter()` rather than `withIndex()`, because `districts` has **no indexes at all** (`convex/schema.ts:5-9`):

```ts
let existingDistrict = await ctx.db.query("districts")
    .filter((q) => jpsDistrictsId
        ? q.eq(q.field("jpsDistrictsId"), jpsDistrictsId)
        : q.eq(q.field("name"), districtName))
    .first();
if (!existingDistrict) {
    const districtDbId = await ctx.db.insert("districts", { ... });
```

Convex mutations are individually transactional, so two *concurrent* `storeDistrictStationsInternal` calls can both observe "absent" and both insert. `updateWaterLevels` invokes this once per district in a loop (`convex/sync/waterLevelUpdater.ts:180`), and H-1 lets an attacker run many overlapping syncs — reliably widening the window. Duplicate districts fragment stations across district rows, so the UI's district filter and `getDistrictsWithCounts` under-report station counts, potentially hiding stations (including ones at danger level) from users. The full-scan `.filter()` also makes every district lookup O(table).

**Remediation.** Add the missing index, use it, and re-check inside the same transaction before inserting.

```diff
--- a/convex/schema.ts
+++ b/convex/schema.ts
     districts: defineTable({
         jpsDistrictsId: v.optional(v.number()),
         name: v.string(),
-    }),
+    })
+        .index("by_jps_districts_id", ["jpsDistrictsId"])
+        .index("by_name", ["name"]),
```

```diff
--- a/convex/waterLevelData.ts
+++ b/convex/waterLevelData.ts
-  let existingDistrict = await ctx.db
-    .query("districts")
-    .filter((q) =>
-      jpsDistrictsId
-        ? q.eq(q.field("jpsDistrictsId"), jpsDistrictsId)
-        : q.eq(q.field("name"), districtName)
-    )
-    .first();
+  const findDistrict = () =>
+    jpsDistrictsId !== undefined
+      ? ctx.db.query("districts")
+          .withIndex("by_jps_districts_id", (q) => q.eq("jpsDistrictsId", jpsDistrictsId))
+          .first()
+      : ctx.db.query("districts")
+          .withIndex("by_name", (q) => q.eq("name", districtName))
+          .first();
+
+  let existingDistrict = await findDistrict();

   if (!existingDistrict) {
-    const districtDbId = await ctx.db.insert("districts", {
-      name: districtName,
-      ...(jpsDistrictsId && { jpsDistrictsId }),
-    });
-    existingDistrict = await ctx.db.get(districtDbId);
+    // Re-check within this transaction to collapse concurrent creators.
+    existingDistrict = await findDistrict();
+    if (!existingDistrict) {
+      const districtDbId = await ctx.db.insert("districts", {
+        name: districtName,
+        ...(jpsDistrictsId !== undefined && { jpsDistrictsId }),
+      });
+      existingDistrict = await ctx.db.get(districtDbId);
+    }
   }
```

Note the `...(jpsDistrictsId && ...)` spread also drops a legitimate `jpsDistrictsId` of `0`; the `!== undefined` check above fixes that latent bug. Add a one-off internal mutation to merge any duplicates already in production.

---

### M-6 — Production deploy key exposed to pull-request-triggered CI

**Severity:** Medium
**Location:** `.github/workflows/validate-convex.yml:1-8, 47-61`

**Evidence.** The `validate-convex` job runs on `pull_request` and injects the **production** deploy key:

```yaml
on:
  pull_request:
    branches: [main]
...
      - run: npm ci
      - name: Validate Convex deploy (dry-run)
        run: npx convex deploy --dry-run
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
```

GitHub withholds secrets from fork-originated `pull_request` runs, so this is not exploitable by arbitrary internet users — which is why this is Medium, not Critical. It remains a real risk for **same-repo** PRs (branches pushed by collaborators, or by an attacker who has compromised any collaborator account or a maintainer's token): `npm ci` executes install lifecycle scripts from the PR's own `package.json`/lockfile, so a PR that adds a `postinstall` script can exfiltrate `CONVEX_DEPLOY_KEY` — a key that grants full write access to the production Convex deployment, including the ability to replace function code. Two contributing weaknesses: neither workflow declares a `permissions:` block, so `GITHUB_TOKEN` inherits repository-default scopes (often write), and all actions are floating tags (`actions/checkout@v4`) rather than pinned digests.

**Remediation.** Use a preview/dev deploy key for PR validation, or drop the key from PR runs (`tsc`/`eslint` already cover schema-adjacent type errors), and restrict token scopes.

```diff
--- a/.github/workflows/validate-convex.yml
+++ b/.github/workflows/validate-convex.yml
 name: PR Checks

 on:
   pull_request:
     branches: [main]

+permissions:
+  contents: read
+
 jobs:
```

```diff
       - name: Validate Convex deploy (dry-run)
         run: npx convex deploy --dry-run
         env:
-          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
+          # Preview/dev-scoped key — must NOT be the production deploy key,
+          # since `npm ci` above runs lifecycle scripts from the PR branch.
+          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_PREVIEW_DEPLOY_KEY }}
```

Also add `permissions: contents: read` to `.github/workflows/deploy-convex.yml`, consider `npm ci --ignore-scripts` where the build permits, and pin third-party actions to commit SHAs. Given that the current key has been available to PR CI, **rotate `CONVEX_DEPLOY_KEY`** as a precaution.

---

### M-7 — Notification subscription state is device-local and unauthenticated

**Severity:** Medium
**Location:** `src/services/notificationService.ts:3,17-40,69-105`; `src/hooks/useStationSubscription.ts:24-68`; `convex/notifications.ts:72-80`

**Evidence.** Subscriptions live entirely in `localStorage` plus OneSignal device tags — there is no server-side subscription record at all (no such table in `convex/schema.ts`), and the frontend never calls a Convex mutation:

```ts
const STORAGE_KEY = "subscribed_stations";
...
await OneSignal.User.addTag(`station_${stationId}`, "true");
```

Backend targeting matches on that tag (`convex/notifications.ts:74-79`). **On the specific question of identity spoofing this design is sound** — there is no client-supplied `userId`/`externalId` to forge, and therefore no cross-tenant read or write of another user's subscriptions. The weaknesses are availability and integrity of the alert channel rather than confidentiality:

- Alert subscriptions are silently lost when a user clears site data, switches browsers, or uses private mode, and never sync across devices. For a flood-warning app, users believing they are subscribed when they are not is a safety-relevant failure mode.
- Any script running in the origin can read the full list of stations a user monitors (a location-inference signal) and can silently unsubscribe them — so the absence of a CSP (M-2) directly amplifies this.
- `notificationLog` (`convex/schema.ts:72-80`) holds only `stationId` + `notifiedAt`, so the 1-hour cooldown is global per station. A user subscribed to one station can be starved of an alert because an unrelated event consumed that station's cooldown window.
- `JSON.parse` on `localStorage` at `src/services/notificationService.ts:21` is `try/catch`-wrapped and cast (`as SubscribedStation[]`) without shape validation. Not remotely exploitable — the attacker would already need origin access — but malformed data propagates into `addTag`/`removeTag` calls.

**Remediation.** This is a design change, not a one-line patch. When authentication is introduced (see *Strategic recommendation*), move subscriptions into a `subscriptions` table keyed on `ctx.auth.getUserIdentity().subject`, and make OneSignal tags a derived cache rather than the source of truth. As an immediate hardening step, validate the parsed shape so corrupt state degrades cleanly:

```diff
--- a/src/services/notificationService.ts
+++ b/src/services/notificationService.ts
         return parsed as SubscribedStation[];
+        if (!Array.isArray(parsed)) return [];
+        return parsed.filter(
+            (s): s is SubscribedStation =>
+                typeof s === "object" && s !== null &&
+                typeof (s as SubscribedStation).id === "string" &&
+                typeof (s as SubscribedStation).name === "string"
+        );
     } catch {
         return [];
     }
```

Independently, add a per-user (or per-subscription) dimension to `notificationLog` so one station's cooldown cannot suppress another user's first alert.

---

## LOW

### L-1 — Dependency vulnerabilities: 21 advisories (14 high, 4 moderate, 3 low), all build-time
**Location:** `package-lock.json`

Lockfile audit results (no runtime server exists — this is a static SPA plus Convex, so none of these execute in production request handling):

| Package | Severity | Direct? | Advisory |
|---|---|---|---|
| `postcss` `<=8.5.22` | High | **direct devDependency** | Arbitrary file read via attacker-controlled `sourceMappingURL`; path traversal in source-map auto-loading; XSS via unescaped `</style>` |
| `rollup` | High | transitive (vite) | Arbitrary file write via path traversal |
| `nanoid`, `glob`, `minimatch`, `picomatch`, `brace-expansion`, `js-yaml`, `flatted`, `fast-uri`, `path-to-regexp`, `@modelcontextprotocol/sdk`, `@babel/*` | High | transitive | ReDoS / DoS / traversal in build tooling |
| `qs`, `body-parser`, `ajv`, `yaml` | Moderate | transitive | DoS |
| `diff`, `postcss-selector-parser`, `@babel/core` | Low | transitive | ReDoS |

Realistic impact is confined to the build/CI environment — the `postcss` and `rollup` file-read/file-write issues matter most there, and combine with M-6 (secrets present in PR CI). A notable share of the transitive tree (`@modelcontextprotocol/sdk`, `body-parser`, `path-to-regexp`) arrives via the `shadcn` CLI devDependency, which is only needed when scaffolding components.

**Remediation.** `npm audit fix` resolves all 21 without a major bump (`fixAvailable: auto` for every entry). Verify with `npm run build && npm run test`, then commit the lockfile. Consider moving `shadcn` out of the installed dependency set (invoke via `npx shadcn@latest` on demand) to shrink the tree, and enable Dependabot for `npm` + `github-actions`.

### L-2 — No rate limiting on any endpoint
No throttling exists on Convex functions or the Netlify image proxy. This is the multiplier behind H-1, H-3, and M-3: every abuse path is "call it in a loop." After the internal/public split is fixed, add a rate limiter (e.g. `@convex-dev/rate-limiter`) keyed on IP or session for the remaining public queries, and consider Netlify rate limiting for `/api/proxy-image/*`.

### L-3 — Dead and misleading code that misstates the security posture
- `scripts/scrapeWaterLevel.js:4` asserts public mutations "have been removed for security." They were not (C-1, C-2). A future reader will trust this comment and skip the fix. Correct or delete it.
- `convex/sync/stationUpdater.ts:85` `insertDistrict` — unreferenced duplicate of `createDistrict`.
- `convex/sync/cameraUpdater.ts:96` `getCameras` — leftover debug `internalMutation` doing `.take(5)`, unused.
- `convex/sync/stationUpdater.ts:111` `getAllDistricts` and `convex/sync/{cameraUpdater,stationUpdater,waterLevelUpdater}.ts` `getDistricts` are **reads declared as mutations**, which skips query caching and takes write-path locks unnecessarily. Convert to `internalQuery` (actions can call queries via `ctx.runQuery`).

### L-4 — Service worker caches API responses in a client-readable store
`vite.config.ts:83-98` caches all `*.convex.cloud/*` responses for 30 minutes in CacheStorage, and `:64-79` caches proxied camera images. All cached content is public flood data today, so impact is minimal — but if any authenticated or per-user endpoint is added later, `NetworkFirst` will persist those responses to disk unless the pattern is narrowed. Restrict the `urlPattern` to the specific read paths rather than a wildcard over the whole deployment, and revisit when auth lands.

### L-5 — Analytics initialised without consent gating
`src/routes/__root.tsx:13-24` calls `posthog.init` unconditionally on mount. `person_profiles: "identified_only"` is a good default and `VITE_POSTHOG_KEY` is a publishable client key (correctly not a secret), so this is a privacy/compliance note rather than a vulnerability: EU/UK visitors receive analytics cookies with no prior consent, and the missing `Referrer-Policy` (M-2) means full station-detail URLs reach PostHog. Gate `init` behind a consent choice, or configure `opt_out_capturing_by_default: true` with an explicit opt-in.

---

## Verified as NOT vulnerable

Confirmed by targeted inspection rather than assumed:

- **No hardcoded secrets.** Repo-wide regex scans for API-key/password/token patterns and for known prefixes (`phc_`, `sk_`, `pk_`, `AKIA`, `gh[pousr]_`, JWT `eyJ`, `os_v2_`) returned nothing. `git log --all --diff-filter=A` shows no `.env`, `.pem`, or key file was **ever** committed; only `.env.example` (placeholders only), which correctly comments out the OneSignal keys with the note "set in Convex dashboard env vars." `.gitignore` covers `.env`, `.env*.local`, and `*.pem`. `ONESIGNAL_REST_API_KEY` is read only from `process.env` server-side (`convex/notifications.ts:93,134`) and never reaches the client. The one nit is the hardcoded deployment URL in H-4 — infrastructure disclosure, not a credential.
- **No XSS sinks.** Zero occurrences of `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `document.write`, `eval`, `new Function`, `insertAdjacentHTML`, or `srcdoc` across `src/`, `convex/`, `netlify/`, `public/`, and `index.html`. All rendering goes through React's escaping JSX. The `<img src>` values in `src/components/CameraCard.tsx:37` and `src/routes/stations/$id.tsx:449` are built from same-origin proxy paths, not raw DB URLs. The exception is the server-side `<img src={cameraUrl}>` in the edge function — covered as SSRF in H-4.
- **No SQL injection.** Convex is a document database with no query-string interface; all data access uses `ctx.db` builders, and every public function except six declares `v.*` argument validators (the exceptions take no arguments). The `v.any()` gap is M-4.
- **No command injection.** No `child_process`, `exec`, `execSync`, or `spawn` anywhere. The single filesystem call is `require('fs').promises` in `scripts/scrapeWaterLevel.js:174`, a local developer script writing to a fixed path.
- **No insecure deserialization.** All four `JSON.parse` call sites are `try/catch`-wrapped over `localStorage` data (`src/lib/FilterContext.tsx:45`, `src/services/notificationService.ts:21`); no `node-serialize`, YAML, or prototype-pollution-prone merge of untrusted input. `{ ...DEFAULT_FILTERS, ...parsed }` at `FilterContext.tsx:46` spreads attacker-influenced keys only from the user's own origin storage.
- **No overly permissive CORS.** No `Access-Control-Allow-*` header is set anywhere; Convex manages its own CORS, and the image proxy is same-origin via the `netlify.toml:19-22` redirect. The gap is *missing* hardening headers (M-2), not permissive ones.
- **No payment or financial logic**, no privilege tiers, and no password storage — so there is no weak-hashing finding and no payment race condition. The business-logic risks that do exist are the alert-integrity and duplicate-district races in C-1 and M-5.
- **Route protection is appropriately absent.** All four routes in `src/routeTree.ts` are public; the single `beforeLoad` (`src/routeTree.ts:16-18`) is a `/` → `/stations` redirect, not a guard. Correct for public flood data — the defect is that *write* endpoints share that posture.

---

## Remediation priority

**Do first (closes both Criticals and H-1/H-2 — roughly a 30-line change):**
1. `convex/crons.ts` — swap the three `api.sync.*` references to `internal.sync.*` (H-1 root cause).
2. `convex/sync/stationUpdater.ts` / `cameraUpdater.ts` — `action` → `internalAction`; delete `createStation`, `createCamera`, `getAllDistricts`; `createDistrict` → `internalMutation` (C-1, C-2).
3. Delete `migrateJpsSelIdToString` and make `seedCoordinatesFromHardcoded` internal (H-2).
4. Redeploy, then verify externally that every write path now returns "Could not find public function."

**Then:**
5. Validate `id` in `netlify/functions/proxy-image.ts`; switch to HTTPS; bound the response (H-3).
6. Rewrite `netlify/edge-functions/og-image.tsx` to derive all displayed values server-side from `stationId` (H-4).
7. Project fields in `getStationById` / `getStationsByDistrict` to drop `gsmNumber`; filter `getCameras` on `isEnabled` (M-1).
8. Add the security-headers block to `netlify.toml`, starting in report-only mode (M-2).
9. Bound `getMultipleStationsTrend`; fix `v.any()`; add `districts` indexes and the transactional re-check (M-3, M-4, M-5).
10. Swap the PR workflow to a preview deploy key, add `permissions: contents: read`, and **rotate `CONVEX_DEPLOY_KEY`** (M-6).
11. `npm audit fix` and enable Dependabot (L-1).

### Verifying the fix

After deploying, confirm from outside the app that the write surface is closed:

```bash
# Expect: {"code":"...","message":"Could not find public function for 'sync/stationUpdater:createStation'"}
curl -sS -X POST "https://<deployment>.convex.cloud/api/mutation" \
  -H 'Content-Type: application/json' \
  -d '{"path":"sync/stationUpdater:createStation","args":{}}'

# Expect: 400 Invalid camera ID (not a proxied upstream page)
curl -sS -o /dev/null -w '%{http_code}\n' \
  "https://<site>/api/proxy-image/../../../../InfoBanjir.WebAdmin/web.config%3F"
```

Repeat the first check for `createCamera`, `createDistrict`, `getAllDistricts`, `migrateJpsSelIdToString`, `seedCoordinatesFromHardcoded`, `updateWaterLevels`, `updateStations`, and `updateCameras`. Confirm the read queries the UI depends on still respond, and that the 15-minute cron still runs (Convex dashboard → Logs).

### Strategic recommendation

The absence of authentication is reasonable for read-only public data, but three needs now point the other way: safe manual sync triggering, cross-device notification subscriptions (M-7), and any future admin capability. When you add auth, use a provider (`convex/auth.config.ts` + `ConvexProviderWithClerk`, or `@convex-dev/auth`), derive identity **exclusively** from `ctx.auth.getUserIdentity()`, and never accept a `userId` as a function argument. Adopt the convention that **every** Convex function is `internal*` by default and made public only with a deliberate review of who may call it — the inverse of the current default, which is what produced these findings.
