# Resilient Read Path (R2 Snapshot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve all public station/camera data from a static JSON + JPEG snapshot on Cloudflare R2 (published by the existing Convex scraper), with honest staleness UI and working social-share cards, so riverlevel.netlify.app stays up when JPS is down *and* when the traffic spike lands on us.

**Architecture:** The Convex cron keeps scraping JPS and writing Convex tables, but now runs every 5 min, skips writes when JPS's data hasn't changed, and publishes `stations.json` / `cameras.json` / `trends.json` / `meta.json` (plus `cam/{id}.jpg`) to an R2 bucket via a `"use node"` action. The Vite SPA reads those files through a small ETag-polling store (`useSnapshot`) behind the existing hook signatures, so components don't change. Two Netlify edge functions (bot-only `/stations/:id` meta HTML, and `/og/station/:id` PNG) render from the same snapshot.

**Tech Stack:** Vite 6 + React 18 + TanStack Router (SPA in `src/`), Convex 1.25 (`convex/`), `aws4fetch` for S3-compatible R2 uploads, `vite-plugin-pwa`/Workbox, Netlify Edge Functions (Deno + `og_edge`), Vitest + jsdom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-29-resilient-read-path-design.md`

## Global Constraints

- Node 22 (`.github/workflows/*.yml`, `netlify.toml`); `"type": "module"` in `package.json`.
- `npm run lint` = `eslint src/ convex/ --ext .ts,.tsx --max-warnings 0` — **zero warnings**: no `any`, no `console.log` (use `console.warn` / `console.error` / `console.debug`), no unused vars.
- `npm run build` = `tsc && vite build`; `tsconfig.json` includes only `src` and `convex`.
- Convex `"use node"` files may **only** export actions; default-runtime files must not import them except via `internal.*` references.
- Alert level enum everywhere: `0=normal, 1=alert, 2=warning, 3=danger, -1=no data`.
- R2 object keys (exact): `stations.json`, `cameras.json`, `trends.json`, `meta.json`, `cam/{jpsCameraId}.jpg`.
- JSON `Cache-Control: public, max-age=60, stale-while-revalidate=300`; image `Cache-Control: public, max-age=300`.
- Env var names (exact): Convex `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`; frontend/Netlify `VITE_SNAPSHOT_BASE_URL` (no trailing slash), `VITE_DATA_SOURCE` (`snapshot` | `convex`), `VITE_SITE_URL`.
- Staleness threshold reuses `STALENESS_THRESHOLD_MS` (45 min) from `src/utils/timeUtils.ts`.
- Commits: one-line message, conventional prefix (`feat:`, `fix:`, `docs:`, `chore:`, `test:`), no trailers.
- Work on a branch off `main` (e.g. `feat/r2-snapshot-read-path`). `convex/` changes deploy to production automatically when merged to `main` (`deploy-convex.yml`) — merge phase by phase.

---

## Phase 0 — Environment

### Task 0: Cloudflare + local setup

**Files:**
- Modify: `package.json` (add `aws4fetch`)
- Modify: `.env.example`
- Modify: `src/vite-env.d.ts`

**Interfaces:**
- Produces: `aws4fetch` available to `convex/lib/r2.ts` (Task 4); env var names used by every later task.

- [ ] **Step 1: Cloudflare console (manual)**

1. R2 → Create bucket `riverlevel-snapshot-dev`; Settings → Public access → R2.dev subdomain → Allow Access. Note the URL, e.g. `https://pub-xxxx.r2.dev`.
2. R2 → Create bucket `riverlevel-snapshot`; enable its R2.dev subdomain the same way and note its URL (this is the production `VITE_SNAPSHOT_BASE_URL` for now). No custom domain yet — decision 2026-08-30; when one is on Cloudflare, Settings → Custom Domains → connect `cdn.<domain>` and update the Netlify env var.
3. On **both** buckets, Settings → CORS policy:

```json
[
  {
    "AllowedOrigins": ["https://riverlevel.netlify.app", "http://localhost:5173", "http://localhost:4173"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["If-None-Match"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

4. R2 → Manage R2 API Tokens → Create token, permission **Object Read & Write**, scoped to the two buckets. Record Access Key ID, Secret Access Key, and your Account ID (shown on the R2 overview page).

- [ ] **Step 2: Convex dev deployment env vars**

```bash
cd /home/luqman/water-level
npm ci
npx convex env set R2_ACCOUNT_ID <account-id>
npx convex env set R2_ACCESS_KEY_ID <key-id>
npx convex env set R2_SECRET_ACCESS_KEY <secret>
npx convex env set R2_BUCKET riverlevel-snapshot-dev
npx convex env list
```

Expected: the four `R2_*` variables listed. (Set the same four on the **production** deployment via the Convex dashboard, with `R2_BUCKET=riverlevel-snapshot`, before merging Phase 1.)

- [ ] **Step 3: Install aws4fetch**

```bash
npm install aws4fetch@^1.0.20
```

Expected: `package.json` `dependencies` gains `"aws4fetch": "^1.0.20"`.

- [ ] **Step 4: Document env vars**

Append to `.env.example`:

```
# Snapshot read path (Cloudflare R2). Set VITE_* in Netlify too.
VITE_SNAPSHOT_BASE_URL=https://cdn.your-domain.example
VITE_DATA_SOURCE=snapshot
# Set in Convex dashboard / `npx convex env set` (used by snapshot publisher + camera sync)
# R2_ACCOUNT_ID=
# R2_ACCESS_KEY_ID=
# R2_SECRET_ACCESS_KEY=
# R2_BUCKET=riverlevel-snapshot
```

Replace the `ImportMetaEnv` interface in `src/vite-env.d.ts` with:

```ts
interface ImportMetaEnv {
    readonly VITE_CONVEX_URL: string;
    readonly VITE_POSTHOG_KEY: string;
    readonly VITE_POSTHOG_HOST: string;
    readonly VITE_SITE_URL?: string;
    readonly VITE_SNAPSHOT_BASE_URL?: string;
    readonly VITE_DATA_SOURCE?: "snapshot" | "convex";
}
```

Create `.env.local` (git-ignored) with `VITE_SNAPSHOT_BASE_URL=<r2.dev URL of the dev bucket>` and `VITE_DATA_SOURCE=convex` (frontend stays on Convex until Phase 2).

- [ ] **Step 5: Verify and commit**

```bash
npm run lint && npm run build
git add package.json package-lock.json .env.example src/vite-env.d.ts
git commit -m "chore: add aws4fetch and snapshot env var declarations"
```

---

## Phase 1 — Publisher + scraper (frontend untouched)

### Task 1: Schema + syncState functions

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/lib/syncKeys.ts`
- Create: `convex/syncState.ts`

**Interfaces:**
- Produces: table `syncState`; `cameras.lastImageAt?: string`; `internal.syncState.get({ key })` → row | null; `internal.syncState.record({...})`; constant `WATER_LEVELS_KEY = "waterLevels"` in `convex/lib/syncKeys.ts` (a pure module so `"use node"` files can import it too).

- [ ] **Step 1: Add the table and field to `convex/schema.ts`**

Inside the `cameras` table definition, after `subBasin: v.optional(v.string()),` add:

```ts
    lastImageAt: v.optional(v.string()), // ISO time the CCTV frame was mirrored to R2
```

After the `notificationLog` table (before the closing `});`) add:

```ts
  syncState: defineTable({
    key: v.string(), // "waterLevels"
    lastJpsFingerprint: v.optional(v.string()),
    lastJpsUpdate: v.optional(v.string()), // ISO, max of JPS allLastUpdated
    lastSyncedAt: v.optional(v.string()), // ISO, last successful full sync (our clock)
    lastAttemptAt: v.string(), // ISO, last attempt (our clock)
    lastStatus: v.union(v.literal("ok"), v.literal("upstream_error")),
    failingSince: v.optional(v.string()), // ISO, first failure of the current outage
    lastError: v.optional(v.string()),
  }).index("by_key", ["key"]),
```

- [ ] **Step 2: Create `convex/lib/syncKeys.ts` and `convex/syncState.ts`**

`convex/lib/syncKeys.ts`:

```ts
/** syncState row keys. Kept in a pure module so both runtimes can import it. */
export const WATER_LEVELS_KEY = "waterLevels";
```

`convex/syncState.ts`:

```ts
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const get = internalQuery({
    args: { key: v.string() },
    handler: async (ctx, { key }) => {
        return await ctx.db
            .query("syncState")
            .withIndex("by_key", (q) => q.eq("key", key))
            .first();
    },
});

/**
 * Upserts the single sync-state row for `key`.
 * - status "ok": clears failingSince/lastError; syncedAt should be the run time
 *   when data changed, or the previous lastSyncedAt when nothing changed.
 * - status "upstream_error": keeps the earliest failingSince of the current outage.
 */
export const record = internalMutation({
    args: {
        key: v.string(),
        attemptedAt: v.string(),
        status: v.union(v.literal("ok"), v.literal("upstream_error")),
        fingerprint: v.optional(v.string()),
        jpsLastUpdate: v.optional(v.string()),
        syncedAt: v.optional(v.string()),
        error: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("syncState")
            .withIndex("by_key", (q) => q.eq("key", args.key))
            .first();

        const failingSince =
            args.status === "upstream_error"
                ? existing?.failingSince ?? args.attemptedAt
                : undefined;

        const next = {
            key: args.key,
            lastJpsFingerprint: args.fingerprint ?? existing?.lastJpsFingerprint,
            lastJpsUpdate: args.jpsLastUpdate ?? existing?.lastJpsUpdate,
            lastSyncedAt: args.syncedAt ?? existing?.lastSyncedAt,
            lastAttemptAt: args.attemptedAt,
            lastStatus: args.status,
            failingSince,
            lastError: args.status === "upstream_error" ? args.error : undefined,
        };

        if (existing) {
            await ctx.db.replace(existing._id, next);
            return existing._id;
        }
        return await ctx.db.insert("syncState", next);
    },
});
```

- [ ] **Step 3: Regenerate types and verify**

```bash
npx convex codegen
npm run lint && npx tsc --noEmit -p convex/tsconfig.json
```

Expected: no errors; `convex/_generated/api.d.ts` now mentions `syncState`.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/syncState.ts convex/lib/syncKeys.ts convex/_generated
git commit -m "feat: add syncState table and cameras.lastImageAt"
```

### Task 2: JPS date + change-detection helpers (pure)

**Files:**
- Create: `convex/sync/jpsDate.ts`
- Create: `convex/sync/changeDetection.ts`
- Modify: `convex/sync/waterLevelUpdater.ts` (remove local `convertJpsDateToIso`, import it)
- Test: `convex/sync/__tests__/jpsDate.test.ts`, `convex/sync/__tests__/changeDetection.test.ts`

**Interfaces:**
- Produces: `convertJpsDateToIso(jpsDate: string): string`; `DistrictStamp { districtId: number; allLastUpdated: string }`; `computeJpsFingerprint(districts: DistrictStamp[]): string`; `latestJpsUpdate(districts: DistrictStamp[]): string | null`.

- [ ] **Step 1: Write the failing tests**

`convex/sync/__tests__/jpsDate.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { convertJpsDateToIso } from "../jpsDate";

describe("convertJpsDateToIso", () => {
    it("converts Malaysian local time (UTC+8) to UTC ISO", () => {
        expect(convertJpsDateToIso("21/08/2025 21:15:00")).toBe("2025-08-21T13:15:00.000Z");
    });

    it("crosses the day boundary correctly", () => {
        expect(convertJpsDateToIso("01/01/2026 03:00:00")).toBe("2025-12-31T19:00:00.000Z");
    });

    it("returns an ISO string for garbage input instead of throwing", () => {
        const out = convertJpsDateToIso("not a date");
        expect(() => new Date(out).toISOString()).not.toThrow();
    });
});
```

`convex/sync/__tests__/changeDetection.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { computeJpsFingerprint, latestJpsUpdate } from "../changeDetection";

const districts = [
    { districtId: 3, allLastUpdated: "29/08/2026 15:45:00" },
    { districtId: 1, allLastUpdated: "29/08/2026 16:15:00" },
];

describe("computeJpsFingerprint", () => {
    it("is order-independent and joins districtId:allLastUpdated", () => {
        expect(computeJpsFingerprint(districts)).toBe(
            "1:29/08/2026 16:15:00|3:29/08/2026 15:45:00"
        );
        expect(computeJpsFingerprint([...districts].reverse())).toBe(
            computeJpsFingerprint(districts)
        );
    });

    it("changes when any district timestamp changes", () => {
        const changed = [districts[0], { districtId: 1, allLastUpdated: "29/08/2026 16:20:00" }];
        expect(computeJpsFingerprint(changed)).not.toBe(computeJpsFingerprint(districts));
    });

    it("is empty for no districts", () => {
        expect(computeJpsFingerprint([])).toBe("");
    });
});

describe("latestJpsUpdate", () => {
    it("returns the most recent timestamp as UTC ISO", () => {
        expect(latestJpsUpdate(districts)).toBe("2026-08-29T08:15:00.000Z");
    });

    it("returns null for no districts", () => {
        expect(latestJpsUpdate([])).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run convex/sync/__tests__
```

Expected: FAIL — "Failed to resolve import ../jpsDate" / "../changeDetection".

- [ ] **Step 3: Create `convex/sync/jpsDate.ts`**

Cut the `convertJpsDateToIso` function (the block starting `// Helper function to convert JPS date format` through its closing `}`) out of `convex/sync/waterLevelUpdater.ts` and paste it here with `export`:

```ts
/**
 * Converts a JPS timestamp ("DD/MM/YYYY HH:mm:ss", Malaysian local time, UTC+8)
 * to a UTC ISO string. Falls back to "now" for unparseable input.
 */
export function convertJpsDateToIso(jpsDate: string): string {
    if (!jpsDate) return new Date().toISOString();

    try {
        const [datePart, timePart] = jpsDate.split(" ");
        const [day, month, year] = datePart.split("/");
        const [hour, minute, second] = timePart.split(":");

        const utcMs = Date.UTC(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute),
            parseInt(second)
        ) - 8 * 60 * 60 * 1000;

        if (Number.isNaN(utcMs)) return new Date().toISOString();
        return new Date(utcMs).toISOString();
    } catch (error) {
        console.warn(`Failed to convert JPS date "${jpsDate}":`, error);
        return new Date().toISOString();
    }
}
```

Note: the original used `new Date(y, m, d, …)` (local time of the runtime) then subtracted 8 h; `Date.UTC` makes it correct regardless of the runtime's timezone — which is what the day-boundary test asserts.

In `convex/sync/waterLevelUpdater.ts`, add at the top:

```ts
import { convertJpsDateToIso } from "./jpsDate";
```

- [ ] **Step 4: Create `convex/sync/changeDetection.ts`**

```ts
import { convertJpsDateToIso } from "./jpsDate";

export interface DistrictStamp {
    districtId: number;
    allLastUpdated: string; // JPS format "DD/MM/YYYY HH:mm:ss"
}

/**
 * Stable fingerprint of "what JPS has published". Identical input across two
 * cron runs means JPS hasn't updated anything, so DB writes can be skipped.
 */
export function computeJpsFingerprint(districts: DistrictStamp[]): string {
    return [...districts]
        .sort((a, b) => a.districtId - b.districtId)
        .map((d) => `${d.districtId}:${d.allLastUpdated}`)
        .join("|");
}

/** Most recent JPS allLastUpdated across districts, as UTC ISO; null if none. */
export function latestJpsUpdate(districts: DistrictStamp[]): string | null {
    let latest: string | null = null;
    for (const d of districts) {
        if (!d.allLastUpdated) continue;
        const iso = convertJpsDateToIso(d.allLastUpdated);
        if (latest === null || iso > latest) latest = iso;
    }
    return latest;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run convex/sync/__tests__ && npm run lint
```

Expected: 8 tests pass, lint clean.

- [ ] **Step 6: Commit**

```bash
git add convex/sync/jpsDate.ts convex/sync/changeDetection.ts convex/sync/waterLevelUpdater.ts convex/sync/__tests__
git commit -m "feat: extract JPS date parsing and add change-detection fingerprint"
```

### Task 3: fetchWithRetry + runWithConcurrency (pure)

**Files:**
- Create: `convex/lib/fetchWithRetry.ts`
- Create: `convex/lib/concurrency.ts`
- Test: `convex/lib/__tests__/fetchWithRetry.test.ts`, `convex/lib/__tests__/concurrency.test.ts`

**Interfaces:**
- Produces: `fetchWithRetry(url: string, options?: FetchRetryOptions): Promise<Response>` where `FetchRetryOptions = { timeoutMs?: number; retries?: number; backoffMs?: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> }`; `runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`convex/lib/__tests__/fetchWithRetry.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { fetchWithRetry } from "../fetchWithRetry";

const ok = () => new Response("ok", { status: 200 });
const noSleep = async () => {};

describe("fetchWithRetry", () => {
    it("returns the first successful response", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(ok());
        const res = await fetchWithRetry("https://x.test/a", { fetchImpl, sleep: noSleep });
        expect(res.status).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("retries once after a non-ok response, then succeeds", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(new Response("busy", { status: 503 }))
            .mockResolvedValueOnce(ok());
        const sleep = vi.fn().mockResolvedValue(undefined);
        const res = await fetchWithRetry("https://x.test/a", { fetchImpl, sleep, retries: 1, backoffMs: 5000 });
        expect(res.status).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledWith(5000);
    });

    it("throws the last error after exhausting retries", async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
        await expect(
            fetchWithRetry("https://x.test/a", { fetchImpl, sleep: noSleep, retries: 2 })
        ).rejects.toThrow("ECONNRESET");
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it("aborts a hung request after timeoutMs", async () => {
        vi.useFakeTimers();
        const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
            new Promise<Response>((_, reject) => {
                init?.signal?.addEventListener("abort", () =>
                    reject(new DOMException("aborted", "AbortError"))
                );
            })
        );
        const pending = fetchWithRetry("https://x.test/slow", {
            fetchImpl: fetchImpl as unknown as typeof fetch,
            sleep: noSleep,
            timeoutMs: 100,
            retries: 0,
        });
        const assertion = expect(pending).rejects.toThrow("aborted");
        await vi.advanceTimersByTimeAsync(100);
        await assertion;
        vi.useRealTimers();
    });
});
```

`convex/lib/__tests__/concurrency.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { runWithConcurrency } from "../concurrency";

describe("runWithConcurrency", () => {
    it("processes every item and never exceeds the limit", async () => {
        let active = 0;
        let peak = 0;
        const seen: number[] = [];
        await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
            active++;
            peak = Math.max(peak, active);
            await new Promise((r) => setTimeout(r, 5));
            seen.push(n);
            active--;
        });
        expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(peak).toBeLessThanOrEqual(3);
        expect(peak).toBeGreaterThan(1);
    });

    it("resolves for an empty list", async () => {
        await expect(runWithConcurrency([], 5, async () => {})).resolves.toBeUndefined();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run convex/lib/__tests__
```

Expected: FAIL — cannot resolve `../fetchWithRetry` / `../concurrency`.

- [ ] **Step 3: Create `convex/lib/fetchWithRetry.ts`**

```ts
export interface FetchRetryOptions {
    timeoutMs?: number;
    retries?: number;
    backoffMs?: number;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * fetch() with a hard timeout (AbortController) and simple fixed-backoff retries.
 * Non-2xx responses count as failures. Resolves with the first ok Response.
 */
export async function fetchWithRetry(url: string, options: FetchRetryOptions = {}): Promise<Response> {
    const {
        timeoutMs = 20_000,
        retries = 1,
        backoffMs = 5_000,
        fetchImpl = fetch,
        sleep = defaultSleep,
    } = options;

    let lastError: unknown = new Error(`fetchWithRetry: no attempts made for ${url}`);

    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(url, { signal: controller.signal });
            if (response.ok) return response;
            lastError = new Error(`HTTP ${response.status} for ${url}`);
        } catch (error) {
            lastError = error;
        } finally {
            clearTimeout(timer);
        }
        if (attempt < retries) await sleep(backoffMs);
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
```

- [ ] **Step 4: Create `convex/lib/concurrency.ts`**

```ts
/** Runs fn over items with at most `limit` in flight. Errors must be handled inside fn. */
export async function runWithConcurrency<T>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<void>
): Promise<void> {
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const item = items[next++];
            await fn(item);
        }
    };
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
    await Promise.all(workers);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run convex/lib/__tests__ && npm run lint
```

Expected: 6 tests pass, lint clean.

- [ ] **Step 6: Commit**

```bash
git add convex/lib
git commit -m "feat: add fetchWithRetry and runWithConcurrency helpers"
```

### Task 4: R2 client (aws4fetch)

**Files:**
- Create: `convex/lib/r2.ts`
- Test: `convex/lib/__tests__/r2.test.ts`

**Interfaces:**
- Consumes: `aws4fetch` (Task 0).
- Produces: `R2Config { accountId; accessKeyId; secretAccessKey; bucket }`; `r2ConfigFromEnv(env: Record<string, string | undefined>): R2Config` (throws listing missing names); `PutObjectOptions { contentType: string; cacheControl: string }`; `R2Client { putObject(key: string, body: string | Uint8Array, options: PutObjectOptions): Promise<void> }`; `createR2Client(config: R2Config): R2Client`.

- [ ] **Step 1: Write the failing test**

`convex/lib/__tests__/r2.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { createR2Client, r2ConfigFromEnv } from "../r2";

const config = {
    accountId: "acct123",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "secretexample",
    bucket: "riverlevel-snapshot-dev",
};

describe("r2ConfigFromEnv", () => {
    it("reads the four R2_* variables", () => {
        expect(
            r2ConfigFromEnv({
                R2_ACCOUNT_ID: "a",
                R2_ACCESS_KEY_ID: "b",
                R2_SECRET_ACCESS_KEY: "c",
                R2_BUCKET: "d",
            })
        ).toEqual({ accountId: "a", accessKeyId: "b", secretAccessKey: "c", bucket: "d" });
    });

    it("throws naming every missing variable", () => {
        expect(() => r2ConfigFromEnv({ R2_ACCOUNT_ID: "a" })).toThrow(
            /R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET/
        );
    });
});

describe("createR2Client.putObject", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("PUTs a SigV4-signed request to the bucket URL with content headers", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await createR2Client(config).putObject("stations.json", '{"a":1}', {
            contentType: "application/json",
            cacheControl: "public, max-age=60",
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const request = fetchMock.mock.calls[0][0] as Request;
        expect(request.url).toBe(
            "https://acct123.r2.cloudflarestorage.com/riverlevel-snapshot-dev/stations.json"
        );
        expect(request.method).toBe("PUT");
        expect(request.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
        expect(request.headers.get("content-type")).toBe("application/json");
        expect(request.headers.get("cache-control")).toBe("public, max-age=60");
        expect(request.headers.get("x-amz-content-sha256")).toBeTruthy();
    });

    it("throws with status and key on a non-2xx response", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 403 })));
        await expect(
            createR2Client(config).putObject("cam/1.jpg", new Uint8Array([1, 2, 3]), {
                contentType: "image/jpeg",
                cacheControl: "public, max-age=300",
            })
        ).rejects.toThrow(/R2 PUT cam\/1.jpg failed: HTTP 403/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run convex/lib/__tests__/r2.test.ts
```

Expected: FAIL — cannot resolve `../r2`.

- [ ] **Step 3: Create `convex/lib/r2.ts`**

```ts
import { AwsClient } from "aws4fetch";

export interface R2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
}

export interface PutObjectOptions {
    contentType: string;
    cacheControl: string;
}

export interface R2Client {
    putObject(key: string, body: string | Uint8Array, options: PutObjectOptions): Promise<void>;
}

const REQUIRED = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

export function r2ConfigFromEnv(env: Record<string, string | undefined>): R2Config {
    const missing = REQUIRED.filter((name) => !env[name]);
    if (missing.length > 0) {
        throw new Error(`Missing R2 environment variables: ${missing.join(", ")}`);
    }
    return {
        accountId: env.R2_ACCOUNT_ID as string,
        accessKeyId: env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
        bucket: env.R2_BUCKET as string,
    };
}

/** Minimal S3-compatible client for Cloudflare R2 (PUT only). Uses global fetch. */
export function createR2Client(config: R2Config): R2Client {
    const aws = new AwsClient({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        service: "s3",
        region: "auto",
    });
    const baseUrl = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`;

    return {
        async putObject(key, body, options) {
            const response = await aws.fetch(`${baseUrl}/${key}`, {
                method: "PUT",
                body,
                headers: {
                    "Content-Type": options.contentType,
                    "Cache-Control": options.cacheControl,
                },
            });
            if (!response.ok) {
                const text = await response.text().catch(() => "");
                throw new Error(`R2 PUT ${key} failed: HTTP ${response.status} ${text}`.trim());
            }
        },
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run convex/lib/__tests__/r2.test.ts && npm run lint
```

Expected: 4 tests pass. If `aws.fetch` is reported as receiving a string rather than a `Request` in your aws4fetch version, change the assertions to `fetchMock.mock.calls[0][0]` being a `Request` via `new Request(...)` — aws4fetch ≥1.0.15 always passes a signed `Request`.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/r2.ts convex/lib/__tests__/r2.test.ts
git commit -m "feat: add R2 put client built on aws4fetch"
```

### Task 5: getAllTrends query + captured_at in station/camera queries

**Files:**
- Modify: `convex/waterLevelHistory.ts`
- Modify: `convex/stations.ts:59-84` (getStationsWithDetails), `:124-149` (getStationsByDistrictWithDetails), `:186-207` (getStationDetailById)
- Modify: `convex/cameras.ts:22-35`

**Interfaces:**
- Consumes: `cameras.lastImageAt` (Task 1).
- Produces: `internal.waterLevelHistory.getAllTrends({})` → `Record<string, TrendPoint[]>`; `TrendPoint { timestamp: number; currentLevel: number; alertLevel: number; recordedAt: string }`; `cameras.captured_at: string | null` on every station/camera query result.

- [ ] **Step 1: Add `getAllTrends` to `convex/waterLevelHistory.ts`**

Change the first import line to include `internalQuery`:

```ts
import { query, internalQuery } from "./_generated/server";
```

Append:

```ts
export interface TrendPoint {
    timestamp: number;
    currentLevel: number;
    alertLevel: number;
    recordedAt: string;
}

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

/**
 * All stations' last-3h history in one indexed pass, grouped by station id.
 * Used by the snapshot publisher to build trends.json.
 */
export const getAllTrends = internalQuery({
    handler: async (ctx): Promise<Record<string, TrendPoint[]>> => {
        const since = Date.now() - THREE_HOURS_MS;
        const rows = await ctx.db
            .query("waterLevelHistory")
            .withIndex("by_timestamp", (q) => q.gte("timestamp", since))
            .order("asc")
            .collect();

        const trends: Record<string, TrendPoint[]> = {};
        for (const row of rows) {
            const key = row.stationId as string;
            (trends[key] ??= []).push({
                timestamp: row.timestamp,
                currentLevel: row.currentLevel,
                alertLevel: row.alertLevel,
                recordedAt: row.recordedAt,
            });
        }
        return trends;
    },
});
```

- [ ] **Step 2: Expose `captured_at`**

In `convex/stations.ts`, in all three `cameras: stationCamera ? { … } : null` blocks (inside `getStationsWithDetails`, `getStationsByDistrictWithDetails`, `getStationDetailById`), add a field so each reads:

```ts
                cameras: stationCamera ? {
                    img_url: stationCamera.imgUrl,
                    jps_camera_id: stationCamera.jpsCameraId,
                    is_enabled: stationCamera.isEnabled,
                    captured_at: stationCamera.lastImageAt ?? null
                } : null,
```

In `convex/cameras.ts` `getCamerasWithDetails`, change the returned object to:

```ts
      return {
        id: camera._id,
        camera_name: camera.cameraName,
        img_url: camera.imgUrl,
        jps_camera_id: camera.jpsCameraId,
        captured_at: camera.lastImageAt ?? null,
        districts: {
          name: district?.name || "Unknown"
        }
      };
```

- [ ] **Step 3: Verify**

```bash
npx convex codegen && npm run lint && npm run build
```

Expected: clean. (`src/` compiles because the added field is optional-compatible with the components' local `Camera`/`Station` interfaces.)

- [ ] **Step 4: Commit**

```bash
git add convex/waterLevelHistory.ts convex/stations.ts convex/cameras.ts convex/_generated
git commit -m "feat: add getAllTrends query and captured_at on camera fields"
```

### Task 6: Snapshot builder (pure)

**Files:**
- Create: `convex/sync/snapshotBuilder.ts`
- Test: `convex/sync/__tests__/snapshotBuilder.test.ts`

**Interfaces:**
- Produces: `SNAPSHOT_KEYS = { stations: "stations.json", cameras: "cameras.json", trends: "trends.json", meta: "meta.json" }`; `JSON_CACHE_CONTROL`; `IMAGE_CACHE_CONTROL`; `cameraImageKey(jpsCameraId: string): string`; `SyncStatus`; `SnapshotMeta { syncedAt: string | null; attemptedAt: string; jpsLastUpdate: string | null; status: SyncStatus; failingSince?: string; error?: string }`; `SnapshotEnvelope<T> { generatedAt: string; items: T }`; `SnapshotFile { key: string; body: string }`; `buildDataFiles(input: { stations: unknown[]; cameras: unknown[]; trends: Record<string, unknown[]>; generatedAt: string }): SnapshotFile[]` (order: trends, cameras, stations); `buildMetaFile(meta: SnapshotMeta): SnapshotFile`; `metaFromSyncState(row: SyncStateLike | null, attemptedAt: string): SnapshotMeta`.

- [ ] **Step 1: Write the failing test**

`convex/sync/__tests__/snapshotBuilder.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
    buildDataFiles,
    buildMetaFile,
    cameraImageKey,
    metaFromSyncState,
    SNAPSHOT_KEYS,
} from "../snapshotBuilder";

describe("buildDataFiles", () => {
    it("emits trends, cameras, stations in that order with a generatedAt envelope", () => {
        const files = buildDataFiles({
            stations: [{ id: "s1" }],
            cameras: [{ id: "c1" }],
            trends: { s1: [{ timestamp: 1 }] },
            generatedAt: "2026-08-29T08:00:00.000Z",
        });
        expect(files.map((f) => f.key)).toEqual([
            SNAPSHOT_KEYS.trends,
            SNAPSHOT_KEYS.cameras,
            SNAPSHOT_KEYS.stations,
        ]);
        expect(JSON.parse(files[2].body)).toEqual({
            generatedAt: "2026-08-29T08:00:00.000Z",
            items: [{ id: "s1" }],
        });
        expect(JSON.parse(files[0].body).items).toEqual({ s1: [{ timestamp: 1 }] });
    });
});

describe("buildMetaFile", () => {
    it("serialises meta and omits undefined optional fields", () => {
        const file = buildMetaFile({
            syncedAt: "2026-08-29T08:00:00.000Z",
            attemptedAt: "2026-08-29T08:05:00.000Z",
            jpsLastUpdate: "2026-08-29T07:45:00.000Z",
            status: "ok",
        });
        expect(file.key).toBe("meta.json");
        expect(JSON.parse(file.body)).toEqual({
            syncedAt: "2026-08-29T08:00:00.000Z",
            attemptedAt: "2026-08-29T08:05:00.000Z",
            jpsLastUpdate: "2026-08-29T07:45:00.000Z",
            status: "ok",
        });
    });
});

describe("metaFromSyncState", () => {
    it("maps a sync-state row to meta", () => {
        expect(
            metaFromSyncState(
                {
                    lastSyncedAt: "A",
                    lastAttemptAt: "B",
                    lastJpsUpdate: "C",
                    lastStatus: "upstream_error",
                    failingSince: "D",
                    lastError: "HTTP 503",
                },
                "ignored"
            )
        ).toEqual({
            syncedAt: "A",
            attemptedAt: "B",
            jpsLastUpdate: "C",
            status: "upstream_error",
            failingSince: "D",
            error: "HTTP 503",
        });
    });

    it("produces an upstream_error meta when no row exists yet", () => {
        expect(metaFromSyncState(null, "2026-08-29T08:05:00.000Z")).toEqual({
            syncedAt: null,
            attemptedAt: "2026-08-29T08:05:00.000Z",
            jpsLastUpdate: null,
            status: "upstream_error",
            error: "No sync has completed yet",
        });
    });
});

describe("cameraImageKey", () => {
    it("builds cam/{id}.jpg", () => {
        expect(cameraImageKey("42")).toBe("cam/42.jpg");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run convex/sync/__tests__/snapshotBuilder.test.ts
```

Expected: FAIL — cannot resolve `../snapshotBuilder`.

- [ ] **Step 3: Create `convex/sync/snapshotBuilder.ts`**

```ts
export const SNAPSHOT_KEYS = {
    stations: "stations.json",
    cameras: "cameras.json",
    trends: "trends.json",
    meta: "meta.json",
} as const;

export const JSON_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";
export const IMAGE_CACHE_CONTROL = "public, max-age=300";

export function cameraImageKey(jpsCameraId: string): string {
    return `cam/${jpsCameraId}.jpg`;
}

export type SyncStatus = "ok" | "upstream_error";

export interface SnapshotMeta {
    syncedAt: string | null;
    attemptedAt: string;
    jpsLastUpdate: string | null;
    status: SyncStatus;
    failingSince?: string;
    error?: string;
}

export interface SnapshotEnvelope<T> {
    generatedAt: string;
    items: T;
}

export interface SnapshotFile {
    key: string;
    body: string;
}

export interface SyncStateLike {
    lastSyncedAt?: string;
    lastAttemptAt: string;
    lastJpsUpdate?: string;
    lastStatus: SyncStatus;
    failingSince?: string;
    lastError?: string;
}

function envelope<T>(generatedAt: string, items: T): string {
    const body: SnapshotEnvelope<T> = { generatedAt, items };
    return JSON.stringify(body);
}

/** Data files in upload order: trends, cameras, stations (meta is uploaded last, separately). */
export function buildDataFiles(input: {
    stations: unknown[];
    cameras: unknown[];
    trends: Record<string, unknown[]>;
    generatedAt: string;
}): SnapshotFile[] {
    return [
        { key: SNAPSHOT_KEYS.trends, body: envelope(input.generatedAt, input.trends) },
        { key: SNAPSHOT_KEYS.cameras, body: envelope(input.generatedAt, input.cameras) },
        { key: SNAPSHOT_KEYS.stations, body: envelope(input.generatedAt, input.stations) },
    ];
}

export function buildMetaFile(meta: SnapshotMeta): SnapshotFile {
    return { key: SNAPSHOT_KEYS.meta, body: JSON.stringify(meta) };
}

export function metaFromSyncState(row: SyncStateLike | null, attemptedAt: string): SnapshotMeta {
    if (!row) {
        return {
            syncedAt: null,
            attemptedAt,
            jpsLastUpdate: null,
            status: "upstream_error",
            error: "No sync has completed yet",
        };
    }
    return {
        syncedAt: row.lastSyncedAt ?? null,
        attemptedAt: row.lastAttemptAt,
        jpsLastUpdate: row.lastJpsUpdate ?? null,
        status: row.lastStatus,
        failingSince: row.failingSince,
        error: row.lastError,
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run convex/sync/__tests__/snapshotBuilder.test.ts && npm run lint
```

Expected: 5 tests pass, lint clean.

- [ ] **Step 5: Commit**

```bash
git add convex/sync/snapshotBuilder.ts convex/sync/__tests__/snapshotBuilder.test.ts
git commit -m "feat: add pure snapshot file builder"
```

### Task 7: Snapshot publisher action (`"use node"`)

**Files:**
- Create: `convex/sync/snapshotPublisher.ts`

**Interfaces:**
- Consumes: `createR2Client`, `r2ConfigFromEnv` (Task 4); `buildDataFiles`, `buildMetaFile`, `metaFromSyncState`, `JSON_CACHE_CONTROL` (Task 6); `internal.syncState.get`, `WATER_LEVELS_KEY` (Task 1); `internal.waterLevelHistory.getAllTrends` (Task 5); `api.stations.getStationsWithDetails`, `api.cameras.getCamerasWithDetails`.
- Produces: `internal.sync.snapshotPublisher.publishSnapshot({ includeData: boolean })` → `{ uploaded: string[] }`.

- [ ] **Step 1: Create `convex/sync/snapshotPublisher.ts`**

```ts
"use node";

import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import { createR2Client, r2ConfigFromEnv } from "../lib/r2";
import { WATER_LEVELS_KEY } from "../lib/syncKeys";
import {
    buildDataFiles,
    buildMetaFile,
    JSON_CACHE_CONTROL,
    metaFromSyncState,
} from "./snapshotBuilder";

const JSON_PUT = { contentType: "application/json", cacheControl: JSON_CACHE_CONTROL };

/**
 * Uploads the public snapshot to R2.
 * - includeData=true: trends.json, cameras.json, stations.json, then meta.json.
 * - includeData=false: meta.json only (attempt/status heartbeat).
 * meta.json is always uploaded last so readers never see syncedAt newer than the data.
 * Runs in the Node runtime so aws4fetch + WebCrypto are guaranteed.
 */
export const publishSnapshot = internalAction({
    args: { includeData: v.boolean() },
    handler: async (ctx, { includeData }): Promise<{ uploaded: string[] }> => {
        const r2 = createR2Client(r2ConfigFromEnv(process.env));
        const generatedAt = new Date().toISOString();
        const uploaded: string[] = [];

        if (includeData) {
            const [stations, cameras, trends] = await Promise.all([
                ctx.runQuery(api.stations.getStationsWithDetails, {}),
                ctx.runQuery(api.cameras.getCamerasWithDetails, {}),
                ctx.runQuery(internal.waterLevelHistory.getAllTrends, {}),
            ]);
            for (const file of buildDataFiles({ stations, cameras, trends, generatedAt })) {
                await r2.putObject(file.key, file.body, JSON_PUT);
                uploaded.push(file.key);
            }
        }

        const state = await ctx.runQuery(internal.syncState.get, { key: WATER_LEVELS_KEY });
        const meta = buildMetaFile(metaFromSyncState(state, generatedAt));
        await r2.putObject(meta.key, meta.body, JSON_PUT);
        uploaded.push(meta.key);

        console.debug(`📤 Snapshot published: ${uploaded.join(", ")}`);
        return { uploaded };
    },
});
```

- [ ] **Step 2: Verify it bundles**

```bash
npx convex codegen && npm run lint && npx convex dev --once
```

Expected: codegen shows `sync/snapshotPublisher`; `convex dev --once` pushes to the dev deployment without bundling errors (the Node runtime bundle includes `aws4fetch`). If you see "Node.js runtime is not enabled", the `"use node"` directive must be the very first statement in the file.

- [ ] **Step 3: Smoke-run against the dev bucket**

```bash
npx convex run sync/snapshotPublisher:publishSnapshot '{"includeData": true}'
curl -s "$VITE_SNAPSHOT_BASE_URL/meta.json"; echo
curl -s "$VITE_SNAPSHOT_BASE_URL/stations.json" | head -c 300; echo
```

Expected: `{"uploaded":["trends.json","cameras.json","stations.json","meta.json"]}`; `meta.json` has `status: "upstream_error"` and `error: "No sync has completed yet"` (no syncState row yet — Task 8 fixes that); `stations.json` starts with `{"generatedAt":"…","items":[{"id":…`.

- [ ] **Step 4: Commit**

```bash
git add convex/sync/snapshotPublisher.ts convex/_generated
git commit -m "feat: publish snapshot JSON to R2 from a Node action"
```

### Task 8: Scraper: 5-min cron, change detection, failure handling, publish

**Files:**
- Modify: `convex/sync/waterLevelUpdater.ts:84-223` (the whole `updateWaterLevels` action)
- Modify: `convex/crons.ts:19-24`

**Interfaces:**
- Consumes: `fetchWithRetry` (Task 3); `computeJpsFingerprint`, `latestJpsUpdate` (Task 2); `internal.syncState.get/record`, `WATER_LEVELS_KEY` (Task 1); `internal.sync.snapshotPublisher.publishSnapshot` (Task 7).
- Produces: `api.sync.waterLevelUpdater.updateWaterLevels()` → `UpdateResult { success; changed; districtsCount; stationsCount; overallStatus; timestamp; error? }`. **Never throws** on upstream failure.

- [ ] **Step 1: Update imports at the top of `convex/sync/waterLevelUpdater.ts`**

Replace the first three lines with:

```ts
import { action, internalMutation, ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { convertJpsDateToIso } from "./jpsDate";
import { computeJpsFingerprint, latestJpsUpdate } from "./changeDetection";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { WATER_LEVELS_KEY } from "../lib/syncKeys";
```

(The `convertJpsDateToIso` import was added in Task 2 — keep a single import.)

- [ ] **Step 2: Replace the whole `updateWaterLevels` export**

Delete from `export const updateWaterLevels = action({` through the `});` that closes it (immediately before `export const getDistricts = internalMutation({`) and insert:

```ts
export interface UpdateResult {
    success: boolean;
    changed: boolean;
    districtsCount: number;
    stationsCount: number;
    overallStatus: string;
    timestamp: string;
    error?: string;
}

function computeOverallStatus(summaryData: JpsDistrictSummary[]): string {
    const total = (pick: (d: JpsDistrictSummary) => number) =>
        summaryData.reduce((sum, d) => sum + pick(d), 0);
    if (total((d) => d.danger) > 0) return "DANGER";
    if (total((d) => d.warning) > 0) return "WARNING";
    if (total((d) => d.alert) > 0) return "ALERT";
    return "NORMAL";
}

/** Publishes the snapshot; an R2 failure must never fail the Convex write. */
async function publishQuietly(ctx: ActionCtx, includeData: boolean): Promise<void> {
    try {
        await ctx.runAction(internal.sync.snapshotPublisher.publishSnapshot, { includeData });
    } catch (error) {
        console.error("Snapshot publish failed (Convex data is intact):", error);
    }
}

export const updateWaterLevels = action({
    handler: async (ctx): Promise<UpdateResult> => {
        const attemptedAt = new Date().toISOString();
        console.debug("🌊 Starting water level sync…");

        const previous = await ctx.runQuery(internal.syncState.get, { key: WATER_LEVELS_KEY });

        // 1. Summary (the only fetch whose failure aborts the run)
        let summaryData: JpsDistrictSummary[];
        try {
            const summaryResponse = await fetchWithRetry(
                `${BASE_URL}/StationRiverLevels/GetWLStationSummary`,
                { timeoutMs: 20_000, retries: 1, backoffMs: 5_000 }
            );
            summaryData = await summaryResponse.json();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("❌ JPS summary fetch failed:", message);
            await ctx.runMutation(internal.syncState.record, {
                key: WATER_LEVELS_KEY,
                attemptedAt,
                status: "upstream_error",
                error: message,
            });
            await publishQuietly(ctx, false);
            return {
                success: false,
                changed: false,
                districtsCount: 0,
                stationsCount: 0,
                overallStatus: "UNKNOWN",
                timestamp: attemptedAt,
                error: message,
            };
        }

        // 2. Change detection — JPS updates irregularly; skip writes when nothing moved
        const stamps = summaryData.map((d) => ({ districtId: d.districtId, allLastUpdated: d.allLastUpdated }));
        const fingerprint = computeJpsFingerprint(stamps);
        const jpsLastUpdate = latestJpsUpdate(stamps) ?? undefined;
        const overallStatus = computeOverallStatus(summaryData);

        if (previous && previous.lastJpsFingerprint === fingerprint) {
            console.debug("JPS data unchanged since last run; skipping DB writes");
            await ctx.runMutation(internal.syncState.record, {
                key: WATER_LEVELS_KEY,
                attemptedAt,
                status: "ok",
                fingerprint,
                jpsLastUpdate,
            });
            await publishQuietly(ctx, false);
            return {
                success: true,
                changed: false,
                districtsCount: summaryData.length,
                stationsCount: 0,
                overallStatus,
                timestamp: attemptedAt,
            };
        }

        // 3. District station data (per-district failures are warn-and-continue)
        let totalStationsSaved = 0;
        for (const district of summaryData) {
            try {
                const districtResponse = await fetchWithRetry(
                    `${BASE_URL}/StationRiverLevels/GetWLAllStationData/${district.districtId}`,
                    { timeoutMs: 20_000, retries: 1, backoffMs: 5_000 }
                );
                const stationData: JpsDistrictStationsResponse = await districtResponse.json();
                const stationsData = stationData.stations || [];
                const stations = stationsData
                    .map((station) => ({
                        id: station.id,
                        stationId: station.stationId || "",
                        name: station.stationName,
                        stationCode: station.stationCode,
                        referenceName: station.referenceName,
                        districtName: station.districtName,
                        currentWaterLevel:
                            (station.waterLevel === null || station.waterLevel === -9999)
                                ? null
                                : station.waterLevel,
                        normalLevel: station.wlth_normal || 0,
                        alertLevel: station.wlth_alert || 0,
                        warningLevel: station.wlth_warning || 0,
                        dangerLevel: station.wlth_danger || 0,
                        waterlevelStatus: station.waterlevelStatus || -1,
                        stationStatus: station.stationStatus || 0,
                        lastUpdate: convertJpsDateToIso(station.lastUpdate),
                        latitude: typeof station.latitude === 'string' ? parseFloat(station.latitude) || undefined : station.latitude || undefined,
                        longitude: typeof station.longitude === 'string' ? parseFloat(station.longitude) || undefined : station.longitude || undefined,
                        batteryLevel: station.batteryLevel === null ? undefined : station.batteryLevel,
                        gsmNumber: station.gsmNumber,
                        markerType: station.markerType,
                        mode: typeof station.mode === 'boolean' ? station.mode : undefined,
                        z1: typeof station.z1 === 'boolean' ? station.z1 : undefined,
                        z2: typeof station.z2 === 'boolean' ? station.z2 : undefined,
                        z3: typeof station.z3 === 'boolean' ? station.z3 : undefined,
                    }))
                    .filter((station) => station.stationStatus == 1);

                const result = await ctx.runMutation(
                    internal.waterLevelData.storeDistrictStationsInternal,
                    {
                        districtId: district.districtId,
                        districtName: district.district,
                        jpsDistrictsId: district.districtId,
                        stations,
                    }
                );
                if (result.success) totalStationsSaved += result.stationsCount;
            } catch (error) {
                console.warn(`Failed to fetch district ${district.districtId}: ${error}`);
            }
        }

        // 4. Record success and publish the full snapshot
        await ctx.runMutation(internal.syncState.record, {
            key: WATER_LEVELS_KEY,
            attemptedAt,
            status: "ok",
            fingerprint,
            jpsLastUpdate,
            syncedAt: attemptedAt,
        });
        await publishQuietly(ctx, true);

        console.debug(
            `✅ Sync complete: ${summaryData.length} districts, ${totalStationsSaved} stations, status ${overallStatus}`
        );
        return {
            success: true,
            changed: true,
            districtsCount: summaryData.length,
            stationsCount: totalStationsSaved,
            overallStatus,
            timestamp: attemptedAt,
        };
    },
});
```

Note the station mapping block is byte-for-byte the existing one (only the surrounding fetch/try changed) — do not "improve" it; `storeDistrictStationsInternal` validates that exact shape.

- [ ] **Step 3: Change the cron interval in `convex/crons.ts`**

Replace the "Update water levels every 15 minutes" block with:

```ts
// Update water levels every 5 minutes. JPS publishes irregularly (15 min nominal,
// 25 min–hours under load); polling often and skipping unchanged data keeps our
// lag minimal without extra DB writes (see sync/changeDetection.ts).
crons.interval(
    "update water levels",
    { minutes: 5 },
    api.sync.waterLevelUpdater.updateWaterLevels
);
```

- [ ] **Step 4: Verify**

```bash
npm run lint && npx tsc --noEmit -p convex/tsconfig.json && npx vitest run convex
```

Expected: clean; all convex tests pass.

- [ ] **Step 5: Commit**

```bash
git add convex/sync/waterLevelUpdater.ts convex/crons.ts convex/_generated
git commit -m "feat: 5-min sync with change detection, upstream failure handling, R2 publish"
```

### Task 9: Phase-1 verification on the dev deployment

**Files:** none (manual verification). Do not skip: this is the gate before merging `convex/` to `main`, which auto-deploys to production.

- [ ] **Step 1: Push and run a real sync**

```bash
npx convex dev --once
npx convex run sync/waterLevelUpdater:updateWaterLevels
```

Expected: `{"success":true,"changed":true,"districtsCount":N,"stationsCount":M,…}` (first run always changes).

- [ ] **Step 2: Compare the snapshot with the live query**

```bash
export VITE_SNAPSHOT_BASE_URL=<r2.dev URL of the dev bucket>   # same value as in .env.local
B="$VITE_SNAPSHOT_BASE_URL"
curl -s "$B/meta.json" | python3 -m json.tool
curl -s "$B/stations.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['items']), 'stations, generatedAt', d['generatedAt'])"
npx convex run stations:getStationsWithDetails | python3 -c "import sys,json; print(len(json.load(sys.stdin)), 'stations from Convex')"
curl -s "$B/trends.json" | python3 -c "import sys,json; d=json.load(sys.stdin)['items']; print(len(d), 'stations with trend points')"
curl -sI "$B/stations.json" | grep -i -E "cache-control|etag|access-control"
```

Expected: `meta.status == "ok"`, `syncedAt == attemptedAt`, station counts equal, `Cache-Control: public, max-age=60, stale-while-revalidate=300`, an `ETag`, and (with an `Origin: http://localhost:5173` header on the request) `access-control-allow-origin`.

- [ ] **Step 3: Unchanged run**

```bash
npx convex run sync/waterLevelUpdater:updateWaterLevels
curl -s "$B/meta.json" | python3 -m json.tool
```

Expected: `"changed":false`; `attemptedAt` advanced, `syncedAt` unchanged.

- [ ] **Step 4: Upstream failure**

Temporarily change `const BASE_URL = …` in `convex/sync/waterLevelUpdater.ts` to `"https://jps.invalid"`, then:

```bash
npx convex dev --once
npx convex run sync/waterLevelUpdater:updateWaterLevels
curl -s "$B/meta.json" | python3 -m json.tool
curl -s "$B/stations.json" | python3 -c "import sys,json; print(json.load(sys.stdin)['generatedAt'])"
git checkout -- convex/sync/waterLevelUpdater.ts && npx convex dev --once
```

Expected: `"success":false`, no throw; `meta.status == "upstream_error"`, `failingSince` set, `syncedAt` still the earlier value; `stations.json.generatedAt` unchanged. The last command restores the real URL.

- [ ] **Step 5: Open the Phase-1 PR**

Push the branch and open a PR to `main` titled `feat: publish water-level snapshot to R2 (phase 1)`. CI must be green (`lint`, `build`, `test`, `convex deploy --dry-run`). Before merging, confirm the four `R2_*` env vars exist on the **production** Convex deployment (with `R2_BUCKET=riverlevel-snapshot`). Merge; `deploy-convex.yml` deploys. Verify `https://cdn.<domain>/meta.json` within 10 minutes.

---

## Phase 2 — Frontend reads the snapshot

### Task 10: Snapshot types, env, and the framework-free store

**Files:**
- Create: `src/lib/snapshotTypes.ts`
- Create: `src/lib/snapshotEnv.ts`
- Create: `src/lib/snapshotStore.ts`
- Test: `src/lib/__tests__/snapshotStore.test.ts`

**Interfaces:**
- Produces:
  - `SnapshotFileName = "stations" | "cameras" | "trends" | "meta"`; `SnapshotEnvelope<T> { generatedAt: string; items: T }`; `SnapshotStation` / `SnapshotCamera` (derived from the Convex query return types); `TrendPoint`; `SnapshotMeta`; `SyncStatus`.
  - `snapshotBaseUrl(): string` (may be `""` in tests), `dataSource(): "snapshot" | "convex"`, `requireSnapshotBaseUrl(): string` (throws if unset). These are **functions, not constants**: tests call `vi.stubEnv` after hoisted imports, so env must be read at call time.
  - `SnapshotState<T> { data: T | undefined; error: Error | null; isLoading: boolean; fetchedAt: number | null; fromCache: boolean }`; `SnapshotStore<T> { subscribe(listener: () => void): () => void; getState(): SnapshotState<T>; refresh(): Promise<void>; start(): void; stop(): void }`; `createSnapshotStore<T>(options: SnapshotStoreOptions): SnapshotStore<T>` with `SnapshotStoreOptions { baseUrl: string; file: SnapshotFileName; pollMs?: number; maxBackoffMs?: number; fetchImpl?: typeof fetch; storage?: Pick<Storage, "getItem" | "setItem"> | null; now?: () => number }`.

- [ ] **Step 1: Create `src/lib/snapshotTypes.ts`**

```ts
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

export type SnapshotFileName = "stations" | "cameras" | "trends" | "meta";

export interface SnapshotEnvelope<T> {
    generatedAt: string;
    items: T;
}

/** Exactly the Convex query shapes — the publisher serialises these queries verbatim. */
export type SnapshotStation = FunctionReturnType<typeof api.stations.getStationsWithDetails>[number];
export type SnapshotCamera = FunctionReturnType<typeof api.cameras.getCamerasWithDetails>[number];

export interface TrendPoint {
    timestamp: number;
    currentLevel: number;
    alertLevel: number;
    recordedAt: string;
}

export type SyncStatus = "ok" | "upstream_error";

export interface SnapshotMeta {
    syncedAt: string | null;
    attemptedAt: string;
    jpsLastUpdate: string | null;
    status: SyncStatus;
    failingSince?: string;
    error?: string;
}

export type StationsSnapshot = SnapshotEnvelope<SnapshotStation[]>;
export type CamerasSnapshot = SnapshotEnvelope<SnapshotCamera[]>;
export type TrendsSnapshot = SnapshotEnvelope<Record<string, TrendPoint[]>>;
```

- [ ] **Step 2: Create `src/lib/snapshotEnv.ts`**

```ts
// Read lazily (functions, not constants): Vitest's vi.stubEnv runs after hoisted
// imports, and Vite inlines import.meta.env.* at build time either way.

export function snapshotBaseUrl(): string {
    return (import.meta.env.VITE_SNAPSHOT_BASE_URL ?? "").replace(/\/+$/, "");
}

export function dataSource(): "snapshot" | "convex" {
    return import.meta.env.VITE_DATA_SOURCE === "convex" ? "convex" : "snapshot";
}

export function requireSnapshotBaseUrl(): string {
    const base = snapshotBaseUrl();
    if (!base) {
        throw new Error("VITE_SNAPSHOT_BASE_URL is not set. Add it to .env.local / Netlify env.");
    }
    return base;
}
```

- [ ] **Step 3: Write the failing store test**

`src/lib/__tests__/snapshotStore.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSnapshotStore } from "@/lib/snapshotStore";

function memoryStorage() {
    const map = new Map<string, string>();
    return {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
        map,
    };
}

const json = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json", ...(init.headers ?? {}) },
        ...init,
    });

describe("createSnapshotStore", () => {
    beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
    afterEach(() => vi.useRealTimers());

    it("fetches on start, exposes data, persists to storage, notifies subscribers", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(json({ generatedAt: "t1", items: [1] }, { headers: { etag: '"e1"' } }));
        const storage = memoryStorage();
        const store = createSnapshotStore<{ items: number[] }>({
            baseUrl: "https://cdn.test", file: "stations", fetchImpl, storage, pollMs: 120_000,
        });
        const listener = vi.fn();
        store.subscribe(listener);

        expect(store.getState().isLoading).toBe(true);
        store.start();
        await vi.advanceTimersByTimeAsync(0);

        expect(fetchImpl).toHaveBeenCalledWith("https://cdn.test/stations.json", expect.objectContaining({ headers: {} }));
        expect(store.getState()).toMatchObject({ data: { items: [1] }, isLoading: false, error: null, fromCache: false });
        expect(listener).toHaveBeenCalled();
        expect(JSON.parse(storage.map.get("snapshot:stations")!)).toMatchObject({ data: { items: [1] }, etag: '"e1"' });
        store.stop();
    });

    it("sends If-None-Match on the next poll and keeps data on 304", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(json({ items: [1] }, { headers: { etag: '"e1"' } }))
            .mockResolvedValueOnce(new Response(null, { status: 304 }));
        const store = createSnapshotStore<{ items: number[] }>({
            baseUrl: "https://cdn.test", file: "meta", fetchImpl, storage: null, pollMs: 120_000,
        });
        store.start();
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(120_000);

        expect(fetchImpl).toHaveBeenLastCalledWith("https://cdn.test/meta.json", expect.objectContaining({ headers: { "If-None-Match": '"e1"' } }));
        expect(store.getState().data).toEqual({ items: [1] });
        expect(store.getState().error).toBeNull();
        store.stop();
    });

    it("hydrates from storage before the network answers and flags fromCache", async () => {
        const storage = memoryStorage();
        storage.setItem("snapshot:cameras", JSON.stringify({ data: { items: ["cached"] }, etag: '"old"', fetchedAt: 5 }));
        const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
        const store = createSnapshotStore<{ items: string[] }>({
            baseUrl: "https://cdn.test", file: "cameras", fetchImpl, storage, pollMs: 120_000,
        });
        store.start();
        expect(store.getState()).toMatchObject({ data: { items: ["cached"] }, fromCache: true, isLoading: false, fetchedAt: 5 });
        store.stop();
    });

    it("keeps old data, sets error, and backs off exponentially on failures", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(json({ items: [1] }))
            .mockRejectedValue(new Error("network down"));
        const store = createSnapshotStore<{ items: number[] }>({
            baseUrl: "https://cdn.test", file: "trends", fetchImpl, storage: null, pollMs: 1_000, maxBackoffMs: 8_000,
        });
        store.start();
        await vi.advanceTimersByTimeAsync(0);          // ok
        await vi.advanceTimersByTimeAsync(1_000);      // fail #1 → next in 2s
        expect(store.getState()).toMatchObject({ data: { items: [1] }, error: expect.any(Error) });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1_000);
        expect(fetchImpl).toHaveBeenCalledTimes(2);    // not yet (backoff)
        await vi.advanceTimersByTimeAsync(1_000);
        expect(fetchImpl).toHaveBeenCalledTimes(3);    // fail #2 → next in 4s
        await vi.advanceTimersByTimeAsync(4_000);
        expect(fetchImpl).toHaveBeenCalledTimes(4);    // fail #3 → next in 8s (cap)
        await vi.advanceTimersByTimeAsync(8_000);
        expect(fetchImpl).toHaveBeenCalledTimes(5);
        store.stop();
    });

    it("treats a non-2xx response as an error", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 502 }));
        const store = createSnapshotStore({ baseUrl: "https://cdn.test", file: "meta", fetchImpl, storage: null });
        store.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().error?.message).toMatch(/502/);
        expect(store.getState().isLoading).toBe(false);
        store.stop();
    });

    it("refresh() is deduplicated while a request is in flight", async () => {
        let resolve!: (r: Response) => void;
        const fetchImpl = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
        const store = createSnapshotStore({ baseUrl: "https://cdn.test", file: "meta", fetchImpl, storage: null });
        store.start();
        void store.refresh();
        void store.refresh();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        resolve(json({ items: [] }));
        await vi.advanceTimersByTimeAsync(0);
        store.stop();
    });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/snapshotStore.test.ts
```

Expected: FAIL — cannot resolve `@/lib/snapshotStore`.

- [ ] **Step 5: Create `src/lib/snapshotStore.ts`**

```ts
import type { SnapshotFileName } from "./snapshotTypes";

export interface SnapshotState<T> {
    data: T | undefined;
    error: Error | null;
    isLoading: boolean;
    fetchedAt: number | null;
    fromCache: boolean;
}

export interface SnapshotStore<T> {
    subscribe(listener: () => void): () => void;
    getState(): SnapshotState<T>;
    refresh(): Promise<void>;
    start(): void;
    stop(): void;
}

export interface SnapshotStoreOptions {
    baseUrl: string;
    file: SnapshotFileName;
    pollMs?: number;
    maxBackoffMs?: number;
    fetchImpl?: typeof fetch;
    storage?: Pick<Storage, "getItem" | "setItem"> | null;
    now?: () => number;
}

interface Persisted<T> {
    data: T;
    etag: string | null;
    fetchedAt: number;
}

export const DEFAULT_POLL_MS = 120_000;
export const DEFAULT_MAX_BACKOFF_MS = 600_000;

/**
 * Polls `${baseUrl}/${file}.json` with ETag revalidation, keeps the last good
 * payload (also in storage), and backs off on errors. No React, no DOM — the
 * hook layer adds visibility/focus triggers.
 */
export function createSnapshotStore<T>(options: SnapshotStoreOptions): SnapshotStore<T> {
    const {
        baseUrl,
        file,
        pollMs = DEFAULT_POLL_MS,
        maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
        fetchImpl = fetch,
        storage = null,
        now = () => Date.now(),
    } = options;

    const url = `${baseUrl}/${file}.json`;
    const storageKey = `snapshot:${file}`;
    const listeners = new Set<() => void>();

    let state: SnapshotState<T> = { data: undefined, error: null, isLoading: true, fetchedAt: null, fromCache: false };
    let etag: string | null = null;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: Promise<void> | null = null;
    let started = false;

    const setState = (patch: Partial<SnapshotState<T>>) => {
        state = { ...state, ...patch };
        listeners.forEach((listener) => listener());
    };

    const persist = (data: T, fetchedAt: number) => {
        if (!storage) return;
        try {
            const record: Persisted<T> = { data, etag, fetchedAt };
            storage.setItem(storageKey, JSON.stringify(record));
        } catch {
            /* quota or private mode — ignore */
        }
    };

    const hydrate = () => {
        if (!storage) return;
        try {
            const raw = storage.getItem(storageKey);
            if (!raw) return;
            const record = JSON.parse(raw) as Persisted<T>;
            etag = record.etag ?? null;
            setState({ data: record.data, fetchedAt: record.fetchedAt, fromCache: true, isLoading: false });
        } catch {
            /* corrupt cache — ignore */
        }
    };

    const schedule = () => {
        if (!started) return;
        if (timer) clearTimeout(timer);
        const delay = failures === 0 ? pollMs : Math.min(pollMs * 2 ** failures, maxBackoffMs);
        timer = setTimeout(() => void refresh(), delay);
    };

    const doFetch = async () => {
        const headers: Record<string, string> = {};
        if (etag) headers["If-None-Match"] = etag;
        try {
            const response = await fetchImpl(url, { headers, cache: "no-cache" });
            if (response.status === 304) {
                failures = 0;
                setState({ error: null, isLoading: false });
                return;
            }
            if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
            const data = (await response.json()) as T;
            etag = response.headers.get("etag");
            failures = 0;
            const fetchedAt = now();
            setState({ data, error: null, isLoading: false, fetchedAt, fromCache: false });
            persist(data, fetchedAt);
        } catch (error) {
            failures += 1;
            setState({ error: error instanceof Error ? error : new Error(String(error)), isLoading: false });
        } finally {
            schedule();
        }
    };

    const refresh = () => {
        if (!inFlight) {
            inFlight = doFetch().finally(() => {
                inFlight = null;
            });
        }
        return inFlight;
    };

    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getState: () => state,
        refresh,
        start() {
            if (started) return;
            started = true;
            hydrate();
            void refresh();
        },
        stop() {
            started = false;
            if (timer) clearTimeout(timer);
            timer = null;
        },
    };
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/snapshotStore.test.ts && npm run lint
```

Expected: 6 tests pass, lint clean. (`cache: "no-cache"` makes the browser revalidate with the CDN instead of serving from its own HTTP cache; the ETag round-trip still makes unchanged polls cheap.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/snapshotTypes.ts src/lib/snapshotEnv.ts src/lib/snapshotStore.ts src/lib/__tests__/snapshotStore.test.ts
git commit -m "feat: add ETag-polling snapshot store and snapshot types"
```

### Task 11: `useSnapshot` hook and data hooks switched to the snapshot

**Files:**
- Create: `src/hooks/useSnapshot.ts`
- Modify: `src/hooks/useStations.ts`, `src/hooks/useCameras.ts`, `src/hooks/useStationDetail.ts`, `src/hooks/useWaterLevelHistory.ts`
- Modify: `src/routes/cameras/index.tsx:61-67`, `src/routes/stations/index.tsx` (pull-to-refresh callbacks, if present — grep `usePullToRefresh`)
- Test: `src/hooks/__tests__/useSnapshot.test.tsx`, `src/hooks/__tests__/snapshotDataHooks.test.tsx`

**Interfaces:**
- Consumes: `createSnapshotStore` (Task 10), `requireSnapshotBaseUrl()`, `dataSource()`.
- Produces: `useSnapshot<T>(file: SnapshotFileName): SnapshotState<T>`; `getSnapshotStore<T>(file): SnapshotStore<T>`; `refreshSnapshots(files?: SnapshotFileName[]): Promise<void>`; `resetSnapshotStoresForTests(): void`. Existing hook signatures unchanged: `useStations() → { data, isLoading }`, `useCameras()`, `useStationDetail(id) → { data: station | null, isLoading }`, `useStationTrend(id) → { data: TrendPoint[] | undefined, isLoading }`.

- [ ] **Step 1: Write the failing tests**

`src/hooks/__tests__/useSnapshot.test.tsx`:

```tsx
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.test");

import { useSnapshot, resetSnapshotStoresForTests, refreshSnapshots } from "@/hooks/useSnapshot";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { etag: '"x"' } });

describe("useSnapshot", () => {
    beforeEach(() => {
        resetSnapshotStoresForTests();
        localStorage.clear();
    });
    afterEach(() => vi.unstubAllGlobals());

    it("loads a file once for many subscribers and re-renders with data", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json({ generatedAt: "t", items: [{ id: "a" }] }));
        vi.stubGlobal("fetch", fetchMock);

        const first = renderHook(() => useSnapshot<{ items: { id: string }[] }>("stations"));
        const second = renderHook(() => useSnapshot<{ items: { id: string }[] }>("stations"));

        await waitFor(() => expect(first.result.current.data?.items).toEqual([{ id: "a" }]));
        expect(second.result.current.data?.items).toEqual([{ id: "a" }]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("refreshes when the tab becomes visible", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json({ items: [] }));
        vi.stubGlobal("fetch", fetchMock);
        renderHook(() => useSnapshot("meta"));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        await act(async () => {
            Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
            document.dispatchEvent(new Event("visibilitychange"));
        });
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });

    it("refreshSnapshots() refetches every started store", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json({ items: [] }));
        vi.stubGlobal("fetch", fetchMock);
        renderHook(() => useSnapshot("stations"));
        renderHook(() => useSnapshot("cameras"));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        await act(() => refreshSnapshots());
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });
});
```

`src/hooks/__tests__/snapshotDataHooks.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.test");
vi.stubEnv("VITE_DATA_SOURCE", "snapshot");

import { resetSnapshotStoresForTests } from "@/hooks/useSnapshot";
import { useStations } from "@/hooks/useStations";
import { useCameras } from "@/hooks/useCameras";
import { useStationDetail } from "@/hooks/useStationDetail";
import { useStationTrend } from "@/hooks/useWaterLevelHistory";

const station = (id: string) => ({
    id, station_name: `S ${id}`, districts: { name: "D" }, current_levels: null, cameras: null,
    normal_water_level: 1, alert_water_level: 2, warning_water_level: 3, danger_water_level: 4, station_status: true,
});

function stubFiles(files: Record<string, unknown>) {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
        const name = url.split("/").pop()!.replace(".json", "");
        return Promise.resolve(new Response(JSON.stringify(files[name] ?? { items: [] }), { status: 200 }));
    }));
}

describe("snapshot-backed data hooks", () => {
    beforeEach(() => { resetSnapshotStoresForTests(); localStorage.clear(); });
    afterEach(() => vi.unstubAllGlobals());

    it("useStations returns items and isLoading until loaded", async () => {
        stubFiles({ stations: { generatedAt: "t", items: [station("a"), station("b")] } });
        const { result } = renderHook(() => useStations());
        expect(result.current.isLoading).toBe(true);
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.data?.map((s) => s.id)).toEqual(["a", "b"]);
    });

    it("useCameras returns camera items", async () => {
        stubFiles({ cameras: { generatedAt: "t", items: [{ id: "c1", camera_name: "Cam", img_url: undefined, jps_camera_id: "9", captured_at: null, districts: { name: "D" } }] } });
        const { result } = renderHook(() => useCameras());
        await waitFor(() => expect(result.current.data?.[0].jps_camera_id).toBe("9"));
    });

    it("useStationDetail finds one station by id and returns null when missing", async () => {
        stubFiles({ stations: { generatedAt: "t", items: [station("a")] } });
        const found = renderHook(() => useStationDetail("a"));
        await waitFor(() => expect(found.result.current.data?.station_name).toBe("S a"));
        const missing = renderHook(() => useStationDetail("zzz"));
        await waitFor(() => expect(missing.result.current.isLoading).toBe(false));
        expect(missing.result.current.data).toBeNull();
        expect(renderHook(() => useStationDetail(undefined)).result.current).toEqual({ data: null, isLoading: false });
    });

    it("useStationTrend returns the station's points, [] when absent, undefined while loading", async () => {
        stubFiles({ trends: { generatedAt: "t", items: { a: [{ timestamp: 1, currentLevel: 1.5, alertLevel: 0, recordedAt: "r" }] } } });
        const { result } = renderHook(() => useStationTrend("a"));
        expect(result.current.data).toBeUndefined();
        await waitFor(() => expect(result.current.data).toHaveLength(1));
        const none = renderHook(() => useStationTrend("nope"));
        await waitFor(() => expect(none.result.current.data).toEqual([]));
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/__tests__/useSnapshot.test.tsx src/hooks/__tests__/snapshotDataHooks.test.tsx
```

Expected: FAIL — cannot resolve `@/hooks/useSnapshot` (and the data-hook test fails because the hooks still call Convex without a provider).

- [ ] **Step 3: Create `src/hooks/useSnapshot.ts`**

```ts
import { useEffect, useSyncExternalStore } from "react";
import { createSnapshotStore, type SnapshotState, type SnapshotStore } from "@/lib/snapshotStore";
import { requireSnapshotBaseUrl } from "@/lib/snapshotEnv";
import type { SnapshotFileName } from "@/lib/snapshotTypes";

const stores = new Map<SnapshotFileName, SnapshotStore<unknown>>();

function safeLocalStorage(): Pick<Storage, "getItem" | "setItem"> | null {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        return null;
    }
}

/** One store per file for the whole app; created lazily, started on first use. */
export function getSnapshotStore<T>(file: SnapshotFileName): SnapshotStore<T> {
    let store = stores.get(file);
    if (!store) {
        store = createSnapshotStore<unknown>({
            baseUrl: requireSnapshotBaseUrl(),
            file,
            storage: safeLocalStorage(),
        });
        stores.set(file, store);
        store.start();
    }
    return store as SnapshotStore<T>;
}

export function useSnapshot<T>(file: SnapshotFileName): SnapshotState<T> {
    const store = getSnapshotStore<T>(file);
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === "visible") void store.refresh();
        };
        const onFocus = () => void store.refresh();
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onFocus);
        return () => {
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", onFocus);
        };
    }, [store]);

    return state;
}

/** Refetch every started store (pull-to-refresh). */
export async function refreshSnapshots(files?: SnapshotFileName[]): Promise<void> {
    const targets = files ? files.flatMap((f) => (stores.has(f) ? [stores.get(f)!] : [])) : [...stores.values()];
    await Promise.all(targets.map((s) => s.refresh()));
}

export function resetSnapshotStoresForTests(): void {
    stores.forEach((s) => s.stop());
    stores.clear();
}
```

- [ ] **Step 4: Rewrite the four data hooks with a build-time source switch**

`src/hooks/useStations.ts`:

```ts
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSnapshot } from "@/hooks/useSnapshot";
import { dataSource } from "@/lib/snapshotEnv";
import type { StationsSnapshot } from "@/lib/snapshotTypes";

function useStationsConvex() {
    const data = useQuery(api.stations.getStationsWithDetails);
    return { data, isLoading: data === undefined };
}

function useStationsSnapshot() {
    const { data } = useSnapshot<StationsSnapshot>("stations");
    return { data: data?.items, isLoading: data === undefined };
}

/**
 * All stations with details. Reads the R2 snapshot (polled, ETag-revalidated);
 * VITE_DATA_SOURCE=convex restores the live Convex subscription (phase-2 rollback).
 */
export const useStations = dataSource() === "convex" ? useStationsConvex : useStationsSnapshot;
```

(`useDistricts` is deleted — nothing imports it.)

`src/hooks/useCameras.ts`:

```ts
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSnapshot } from "@/hooks/useSnapshot";
import { dataSource } from "@/lib/snapshotEnv";
import type { CamerasSnapshot } from "@/lib/snapshotTypes";

function useCamerasConvex() {
    const data = useQuery(api.cameras.getCamerasWithDetails);
    return { data, isLoading: data === undefined };
}

function useCamerasSnapshot() {
    const { data } = useSnapshot<CamerasSnapshot>("cameras");
    return { data: data?.items, isLoading: data === undefined };
}

export const useCameras = dataSource() === "convex" ? useCamerasConvex : useCamerasSnapshot;
```

`src/hooks/useStationDetail.ts`:

```ts
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useSnapshot } from "@/hooks/useSnapshot";
import { dataSource } from "@/lib/snapshotEnv";
import type { StationsSnapshot } from "@/lib/snapshotTypes";

function useStationDetailConvex(stationId: string | undefined) {
    const data = useQuery(
        api.stations.getStationDetailById,
        stationId ? { stationId: stationId as Id<"stations"> } : "skip"
    );
    return { data: data ?? null, isLoading: data === undefined && !!stationId };
}

function useStationDetailSnapshot(stationId: string | undefined) {
    const { data } = useSnapshot<StationsSnapshot>("stations");
    const station = useMemo(
        () => (stationId && data ? data.items.find((s) => s.id === stationId) ?? null : null),
        [data, stationId]
    );
    return { data: station, isLoading: data === undefined && !!stationId };
}

/** One station's details (same item shape as the list). */
export const useStationDetail = dataSource() === "convex" ? useStationDetailConvex : useStationDetailSnapshot;
```

`src/hooks/useWaterLevelHistory.ts`:

```ts
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useSnapshot } from "@/hooks/useSnapshot";
import { dataSource } from "@/lib/snapshotEnv";
import type { TrendsSnapshot, TrendPoint } from "@/lib/snapshotTypes";

const EMPTY: TrendPoint[] = [];

function useStationTrendConvex(stationId: string) {
    const data = useQuery(
        api.waterLevelHistory.getStationTrend,
        stationId ? { stationId: stationId as Id<"stations"> } : "skip"
    );
    return { data, isLoading: data === undefined && !!stationId };
}

function useStationTrendSnapshot(stationId: string) {
    const { data } = useSnapshot<TrendsSnapshot>("trends");
    const points = data ? data.items[stationId] ?? EMPTY : undefined;
    return { data: points, isLoading: data === undefined && !!stationId };
}

/**
 * 3-hour trend for a station. Every StationCard calls this; with the snapshot
 * source they all share one trends.json fetch instead of one subscription each.
 */
export const useStationTrend = dataSource() === "convex" ? useStationTrendConvex : useStationTrendSnapshot;
```

- [ ] **Step 5: Wire pull-to-refresh to the stores**

In `src/routes/cameras/index.tsx`, replace the `usePullToRefresh` block (lines ~61-67) with:

```tsx
    // Pull-to-refresh: refetch the snapshot files (ETag-revalidated, cheap)
    const pullToRefresh = usePullToRefresh({
        onRefresh: async () => {
            await refreshSnapshots();
        },
        threshold: 80,
    });
```

and add `import { refreshSnapshots } from "@/hooks/useSnapshot";`. Run `grep -n usePullToRefresh src/routes/stations/index.tsx`; if the stations list also uses it, apply the same change there.

- [ ] **Step 6: Run tests and lint**

```bash
npx vitest run && npm run lint && npm run build
```

Expected: all tests pass (including the pre-existing `StationCard`, `NotificationHandler`, `useStationSubscription` tests), lint clean, build clean.

- [ ] **Step 7: Commit**

```bash
git add src/hooks src/routes
git commit -m "feat: read stations, cameras and trends from the R2 snapshot"
```

### Task 12: Freshness state + DataFreshnessBanner

**Files:**
- Create: `src/lib/freshness.ts`
- Create: `src/components/DataFreshnessBanner.tsx`
- Modify: `src/routes/__root.tsx`
- Test: `src/lib/__tests__/freshness.test.ts`, `src/components/__tests__/DataFreshnessBanner.test.tsx`

**Interfaces:**
- Consumes: `SnapshotMeta` (Task 10), `useSnapshot` (Task 11), `STALENESS_THRESHOLD_MS` and default export `formatTimestamp` from `src/utils/timeUtils.ts`.
- Produces: `FreshnessState = { kind: "fresh" } | { kind: "jps-lagging"; jpsLastUpdate: string; attemptedAt: string } | { kind: "upstream-down"; since: string; lastGood: string | null } | { kind: "snapshot-unreachable"; lastGood: string | null }`; `getFreshnessState(meta: SnapshotMeta | undefined, fetchError: Error | null, now: number): FreshnessState`; `<DataFreshnessBanner />`.

- [ ] **Step 1: Write the failing tests**

`src/lib/__tests__/freshness.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getFreshnessState } from "@/lib/freshness";
import { STALENESS_THRESHOLD_MS } from "@/utils/timeUtils";

const NOW = Date.parse("2026-08-29T10:00:00.000Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("getFreshnessState", () => {
    it("is fresh while meta is loading", () => {
        expect(getFreshnessState(undefined, null, NOW)).toEqual({ kind: "fresh" });
    });

    it("is fresh when synced ok and JPS reported within the threshold", () => {
        const meta = { status: "ok" as const, syncedAt: iso(60_000), attemptedAt: iso(60_000), jpsLastUpdate: iso(STALENESS_THRESHOLD_MS - 1) };
        expect(getFreshnessState(meta, null, NOW)).toEqual({ kind: "fresh" });
    });

    it("is jps-lagging at exactly the threshold", () => {
        const meta = { status: "ok" as const, syncedAt: iso(60_000), attemptedAt: iso(60_000), jpsLastUpdate: iso(STALENESS_THRESHOLD_MS) };
        expect(getFreshnessState(meta, null, NOW)).toEqual({ kind: "jps-lagging", jpsLastUpdate: meta.jpsLastUpdate, attemptedAt: meta.attemptedAt });
    });

    it("is upstream-down on upstream_error, using failingSince and syncedAt", () => {
        const meta = { status: "upstream_error" as const, syncedAt: iso(3_600_000), attemptedAt: iso(0), jpsLastUpdate: iso(3_600_000), failingSince: iso(1_800_000), error: "HTTP 503" };
        expect(getFreshnessState(meta, null, NOW)).toEqual({ kind: "upstream-down", since: meta.failingSince, lastGood: meta.syncedAt });
    });

    it("falls back to attemptedAt when failingSince is absent", () => {
        const meta = { status: "upstream_error" as const, syncedAt: null, attemptedAt: iso(0), jpsLastUpdate: null };
        expect(getFreshnessState(meta, null, NOW)).toEqual({ kind: "upstream-down", since: meta.attemptedAt, lastGood: null });
    });

    it("is snapshot-unreachable when the fetch fails, keeping cached lastGood", () => {
        const cached = { status: "ok" as const, syncedAt: iso(600_000), attemptedAt: iso(600_000), jpsLastUpdate: iso(600_000) };
        expect(getFreshnessState(cached, new Error("HTTP 502"), NOW)).toEqual({ kind: "snapshot-unreachable", lastGood: cached.syncedAt });
        expect(getFreshnessState(undefined, new Error("offline"), NOW)).toEqual({ kind: "snapshot-unreachable", lastGood: null });
    });
});
```

`src/components/__tests__/DataFreshnessBanner.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const useSnapshotMock = vi.fn();
vi.mock("@/hooks/useSnapshot", () => ({ useSnapshot: (...args: unknown[]) => useSnapshotMock(...args) }));

import { DataFreshnessBanner } from "@/components/DataFreshnessBanner";

const base = { isLoading: false, fetchedAt: 1, fromCache: false };

describe("DataFreshnessBanner", () => {
    beforeEach(() => useSnapshotMock.mockReset());

    it("renders nothing when fresh", () => {
        useSnapshotMock.mockReturnValue({ ...base, error: null, data: { status: "ok", syncedAt: new Date().toISOString(), attemptedAt: new Date().toISOString(), jpsLastUpdate: new Date().toISOString() } });
        const { container } = render(<DataFreshnessBanner />);
        expect(container).toBeEmptyDOMElement();
    });

    it("shows the lagging message with role=status", () => {
        const old = new Date(Date.now() - 2 * 3_600_000).toISOString();
        useSnapshotMock.mockReturnValue({ ...base, error: null, data: { status: "ok", syncedAt: old, attemptedAt: new Date().toISOString(), jpsLastUpdate: old } });
        render(<DataFreshnessBanner />);
        expect(screen.getByRole("status")).toHaveTextContent(/JPS last reported/i);
    });

    it("shows the upstream-down message with role=alert", () => {
        useSnapshotMock.mockReturnValue({ ...base, error: null, data: { status: "upstream_error", syncedAt: new Date().toISOString(), attemptedAt: new Date().toISOString(), jpsLastUpdate: null, failingSince: new Date().toISOString() } });
        render(<DataFreshnessBanner />);
        expect(screen.getByRole("alert")).toHaveTextContent(/Can't reach JPS/i);
    });

    it("shows the unreachable message when meta fails to load", () => {
        useSnapshotMock.mockReturnValue({ ...base, error: new Error("HTTP 502"), data: undefined });
        render(<DataFreshnessBanner />);
        expect(screen.getByRole("status")).toHaveTextContent(/Can't reach the data server/i);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/__tests__/freshness.test.ts src/components/__tests__/DataFreshnessBanner.test.tsx
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/freshness.ts`**

```ts
import { STALENESS_THRESHOLD_MS } from "@/utils/timeUtils";
import type { SnapshotMeta } from "@/lib/snapshotTypes";

export type FreshnessState =
    | { kind: "fresh" }
    | { kind: "jps-lagging"; jpsLastUpdate: string; attemptedAt: string }
    | { kind: "upstream-down"; since: string; lastGood: string | null }
    | { kind: "snapshot-unreachable"; lastGood: string | null };

/**
 * Derives the global data-freshness banner state.
 * - fetchError wins: we can't even read meta.json (offline, CDN down).
 * - then the scraper's own status (JPS unreachable).
 * - then JPS's feed age (they publish irregularly under load).
 */
export function getFreshnessState(
    meta: SnapshotMeta | undefined,
    fetchError: Error | null,
    now: number
): FreshnessState {
    if (fetchError) return { kind: "snapshot-unreachable", lastGood: meta?.syncedAt ?? null };
    if (!meta) return { kind: "fresh" };
    if (meta.status === "upstream_error") {
        return { kind: "upstream-down", since: meta.failingSince ?? meta.attemptedAt, lastGood: meta.syncedAt };
    }
    if (meta.jpsLastUpdate && now - Date.parse(meta.jpsLastUpdate) >= STALENESS_THRESHOLD_MS) {
        return { kind: "jps-lagging", jpsLastUpdate: meta.jpsLastUpdate, attemptedAt: meta.attemptedAt };
    }
    return { kind: "fresh" };
}
```

- [ ] **Step 4: Create `src/components/DataFreshnessBanner.tsx`**

```tsx
import { useSnapshot } from "@/hooks/useSnapshot";
import { getFreshnessState } from "@/lib/freshness";
import type { SnapshotMeta } from "@/lib/snapshotTypes";
import formatTimestamp from "@/utils/timeUtils";
import { cn } from "@/lib/utils";

const ago = (iso: string | null) => (iso ? formatTimestamp(iso) : "unknown");

/**
 * Global banner explaining *why* data may be old: JPS lagging, JPS unreachable,
 * or our own snapshot server unreachable. Sits under OfflineBanner.
 */
export function DataFreshnessBanner() {
    const { data: meta, error } = useSnapshot<SnapshotMeta>("meta");
    const state = getFreshnessState(meta, error, Date.now());

    if (state.kind === "fresh") return null;

    const tone =
        state.kind === "upstream-down"
            ? "bg-destructive/90 text-destructive-foreground"
            : state.kind === "jps-lagging"
              ? "bg-warning/90 text-warning-foreground"
              : "bg-muted text-muted-foreground";

    const message =
        state.kind === "jps-lagging"
            ? `JPS last reported ${ago(state.jpsLastUpdate)}. Their feed is lagging — we last checked ${ago(state.attemptedAt)}.`
            : state.kind === "upstream-down"
              ? `Can't reach JPS since ${ago(state.since)}. Showing last good data from ${ago(state.lastGood)}.`
              : `Can't reach the data server — showing data saved on this device ${ago(state.lastGood)}.`;

    return (
        <div
            role={state.kind === "upstream-down" ? "alert" : "status"}
            className={cn("px-4 py-2 text-center text-sm font-medium sticky top-0 z-40 backdrop-blur-sm", tone)}
        >
            {message}
        </div>
    );
}
```

- [ ] **Step 5: Mount it in `src/routes/__root.tsx`**

Add `import { DataFreshnessBanner } from "@/components/DataFreshnessBanner";` and render `<DataFreshnessBanner />` on the line directly after `<OfflineBanner />`.

- [ ] **Step 6: Run tests, lint, build**

```bash
npx vitest run && npm run lint && npm run build
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/freshness.ts src/components/DataFreshnessBanner.tsx src/routes/__root.tsx src/lib/__tests__/freshness.test.ts src/components/__tests__/DataFreshnessBanner.test.tsx
git commit -m "feat: add data freshness banner driven by meta.json"
```

### Task 13: Service-worker rule for snapshot JSON + Phase-2 deploy

**Files:**
- Modify: `vite.config.ts`
- Modify: `netlify.toml` (comment only)

**Interfaces:**
- Consumes: `VITE_SNAPSHOT_BASE_URL` at build time.

- [ ] **Step 1: Read the env in `vite.config.ts`**

Change the top of the file to:

```ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "VITE_");
    const snapshotBase = (env.VITE_SNAPSHOT_BASE_URL ?? "").replace(/\/+$/, "");
    // Workbox serialises runtimeCaching into the SW file, so patterns must be
    // literal RegExps (a closure over `snapshotBase` would not survive).
    const snapshotJsonPattern = snapshotBase
        ? new RegExp(`^${escapeRegExp(snapshotBase)}/[a-z]+\\.json$`, "i")
        : /$^/;

    return {
        plugins: [
            react(),
            VitePWA({
```

and close the config accordingly: the existing `plugins: [...]` and `resolve: {...}` become properties of the returned object, and the file ends with `    };\n});`.

- [ ] **Step 2: Add the JSON rule**

Inside `workbox.runtimeCaching`, add before the existing `/api/proxy-image/` rule:

```ts
                    {
                        // Snapshot JSON from R2/Cloudflare: latest when online,
                        // last copy when the CDN is unreachable (fallback-site property)
                        urlPattern: snapshotJsonPattern,
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "snapshot-json",
                            networkTimeoutSeconds: 8,
                            expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
```

- [ ] **Step 3: Build and inspect the generated SW**

```bash
VITE_SNAPSHOT_BASE_URL=https://cdn.example.test npm run build
grep -o 'cdn\\\\.example\\\\.test[^"]*json' dist/sw.js | head -1
```

Expected: the escaped pattern appears in `dist/sw.js`.

- [ ] **Step 4: Netlify env + deploy**

In the Netlify dashboard set `VITE_SNAPSHOT_BASE_URL=https://cdn.<domain>` and `VITE_DATA_SOURCE=snapshot`. Add to `netlify.toml` under `[build.environment]`:

```toml
  # VITE_SNAPSHOT_BASE_URL and VITE_DATA_SOURCE are set in the Netlify dashboard.
```

Open the Phase-2 PR (`feat: frontend reads the R2 snapshot (phase 2)`), get CI green, merge. Deploy-preview check before merging: open the preview, DevTools → Network: exactly one request each to `stations.json`, `trends.json`, `cameras.json` (cameras page), `meta.json`; **no** `convex.cloud` WebSocket. Block `cdn.<domain>` (DevTools → Network → block request domain) and reload: the page still renders and the grey banner appears.

Rollback if needed: set `VITE_DATA_SOURCE=convex` in Netlify and trigger a redeploy.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts netlify.toml
git commit -m "feat: cache snapshot JSON in the service worker"
```

---

## Phase 3 — Camera images mirrored to R2

### Task 14: Camera image sync action + crons

**Files:**
- Modify: `convex/cameras.ts` (add `listForImageSync`, `setLastImageAt`)
- Create: `convex/sync/cameraImageSync.ts`
- Modify: `convex/crons.ts`

**Interfaces:**
- Consumes: `fetchWithRetry`, `runWithConcurrency` (Task 3); `createR2Client`, `r2ConfigFromEnv` (Task 4); `cameraImageKey`, `IMAGE_CACHE_CONTROL` (Task 6); `publishSnapshot` (Task 7); `cameras.lastImageAt` (Task 1).
- Produces: `internal.cameras.listForImageSync({ tier: "all" | "alert" })` → `{ _id: Id<"cameras">; jpsCameraId: string }[]`; `internal.cameras.setLastImageAt({ cameraId, capturedAt })`; `internal.sync.cameraImageSync.syncCameraImages({ tier })` → `{ attempted: number; uploaded: number }`.

- [ ] **Step 1: Add the two functions to `convex/cameras.ts`**

Change the import line to `import { query, internalQuery, internalMutation } from "./_generated/server";` and append:

```ts
/**
 * Cameras to mirror. "all" = every enabled camera; "alert" = only cameras whose
 * linked station is currently at alert level or above (refreshed more often).
 */
export const listForImageSync = internalQuery({
  args: { tier: v.union(v.literal("all"), v.literal("alert")) },
  handler: async (ctx, { tier }) => {
    const cameras = await ctx.db
      .query("cameras")
      .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
      .collect();

    let selected = cameras;
    if (tier === "alert") {
      const levels = await ctx.db.query("currentLevels").collect();
      const elevated = new Set(
        levels.filter((l) => l.alertLevel >= 1).map((l) => l.stationId)
      );
      selected = cameras.filter((c) => c.stationId !== undefined && elevated.has(c.stationId));
    }

    return selected.map((c) => ({ _id: c._id, jpsCameraId: c.jpsCameraId }));
  },
});

export const setLastImageAt = internalMutation({
  args: { cameraId: v.id("cameras"), capturedAt: v.string() },
  handler: async (ctx, { cameraId, capturedAt }) => {
    await ctx.db.patch(cameraId, { lastImageAt: capturedAt });
  },
});
```

- [ ] **Step 2: Create `convex/sync/cameraImageSync.ts`**

```ts
"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createR2Client, r2ConfigFromEnv } from "../lib/r2";
import { fetchWithRetry } from "../lib/fetchWithRetry";
import { runWithConcurrency } from "../lib/concurrency";
import { cameraImageKey, IMAGE_CACHE_CONTROL } from "./snapshotBuilder";

export const CCTV_BASE_URL = "http://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image";

/**
 * Mirrors JPS CCTV frames to R2 as cam/{jpsCameraId}.jpg so the camera pages
 * never hit JPS live. Failed cameras keep their previous frame on R2.
 * Budget: "all" every 15 min ≈ 262k PUTs/month; "alert" every 5 min for the few elevated stations.
 */
export const syncCameraImages = internalAction({
    args: { tier: v.union(v.literal("all"), v.literal("alert")) },
    handler: async (ctx, { tier }): Promise<{ attempted: number; uploaded: number }> => {
        const cameras = await ctx.runQuery(internal.cameras.listForImageSync, { tier });
        if (cameras.length === 0) return { attempted: 0, uploaded: 0 };

        const r2 = createR2Client(r2ConfigFromEnv(process.env));
        let uploaded = 0;

        await runWithConcurrency(cameras, 5, async (camera) => {
            try {
                const response = await fetchWithRetry(`${CCTV_BASE_URL}/${camera.jpsCameraId}.jpg`, {
                    timeoutMs: 10_000,
                    retries: 0,
                });
                const contentType = response.headers.get("content-type") ?? "";
                if (!contentType.startsWith("image/")) {
                    console.warn(`camera ${camera.jpsCameraId}: unexpected content-type "${contentType}"`);
                    return;
                }
                const body = new Uint8Array(await response.arrayBuffer());
                if (body.byteLength === 0) {
                    console.warn(`camera ${camera.jpsCameraId}: empty body`);
                    return;
                }
                await r2.putObject(cameraImageKey(camera.jpsCameraId), body, {
                    contentType: "image/jpeg",
                    cacheControl: IMAGE_CACHE_CONTROL,
                });
                await ctx.runMutation(internal.cameras.setLastImageAt, {
                    cameraId: camera._id,
                    capturedAt: new Date().toISOString(),
                });
                uploaded += 1;
            } catch (error) {
                console.warn(`camera ${camera.jpsCameraId}: ${error instanceof Error ? error.message : String(error)}`);
            }
        });

        // Re-publish JSON so captured_at is current for the UI captions.
        if (uploaded > 0) {
            try {
                await ctx.runAction(internal.sync.snapshotPublisher.publishSnapshot, { includeData: true });
            } catch (error) {
                console.error("Snapshot publish after camera sync failed:", error);
            }
        }

        console.debug(`📷 Camera sync (${tier}): ${uploaded}/${cameras.length} uploaded`);
        return { attempted: cameras.length, uploaded };
    },
});
```

- [ ] **Step 3: Register the crons in `convex/crons.ts`**

After the "update water levels" block add:

```ts
// Mirror CCTV frames to R2. All cameras every 15 min keeps R2 writes ≈ 262k/month
// (free tier: 1M); cameras at alert+ stations refresh every 5 min.
crons.interval(
    "mirror camera images (all)",
    { minutes: 15 },
    internal.sync.cameraImageSync.syncCameraImages,
    { tier: "all" }
);

crons.interval(
    "mirror camera images (alert)",
    { minutes: 5 },
    internal.sync.cameraImageSync.syncCameraImages,
    { tier: "alert" }
);
```

- [ ] **Step 4: Verify on the dev deployment**

```bash
npx convex codegen && npm run lint && npx convex dev --once
npx convex run sync/cameraImageSync:syncCameraImages '{"tier":"all"}'
curl -sI "$VITE_SNAPSHOT_BASE_URL/cam/$(curl -s "$VITE_SNAPSHOT_BASE_URL/cameras.json" | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['jps_camera_id'])").jpg" | grep -i -E "HTTP|content-type|cache-control"
curl -s "$VITE_SNAPSHOT_BASE_URL/cameras.json" | python3 -c "import sys,json; items=json.load(sys.stdin)['items']; print(sum(1 for c in items if c['captured_at']), 'of', len(items), 'have captured_at')"
```

Expected: `{"attempted":91,"uploaded":N}` with N close to 91 (JPS occasionally serves a placeholder or times out); the HEAD shows `200`, `image/jpeg`, `public, max-age=300`; most cameras have `captured_at`.

- [ ] **Step 5: Commit**

```bash
git add convex/cameras.ts convex/sync/cameraImageSync.ts convex/crons.ts convex/_generated
git commit -m "feat: mirror JPS camera images to R2 on a cron"
```

### Task 15: Frontend camera URLs from R2; delete the Netlify proxy

**Files:**
- Create: `src/lib/cameraImageUrl.ts`
- Modify: `src/components/CameraCard.tsx:12-20, 37, ~82`
- Modify: `src/routes/cameras/index.tsx:73, 103`
- Modify: `src/routes/stations/$id.tsx:442, 449`
- Modify: `vite.config.ts` (replace the proxy-image SW rule)
- Delete: `netlify/functions/proxy-image.ts`
- Modify: `netlify.toml` (remove the proxy redirect)
- Test: `src/lib/__tests__/cameraImageUrl.test.ts`

**Interfaces:**
- Consumes: `snapshotBaseUrl()` (Task 10); `captured_at` on camera objects (Task 5).
- Produces: `cameraImageUrl(baseUrl: string, jpsCameraId: string, capturedAt?: string | null): string`.

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/cameraImageUrl.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cameraImageUrl } from "@/lib/cameraImageUrl";

describe("cameraImageUrl", () => {
    it("points at cam/{id}.jpg on the snapshot host", () => {
        expect(cameraImageUrl("https://cdn.test", "42")).toBe("https://cdn.test/cam/42.jpg");
    });

    it("appends the capture time as a cache-busting query", () => {
        expect(cameraImageUrl("https://cdn.test", "42", "2026-08-29T08:00:00.000Z")).toBe(
            "https://cdn.test/cam/42.jpg?v=2026-08-29T08%3A00%3A00.000Z"
        );
    });

    it("ignores a null capture time and a trailing slash on the base", () => {
        expect(cameraImageUrl("https://cdn.test/", "7", null)).toBe("https://cdn.test/cam/7.jpg");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/cameraImageUrl.test.ts
```

Expected: FAIL — cannot resolve `@/lib/cameraImageUrl`.

- [ ] **Step 3: Create `src/lib/cameraImageUrl.ts`**

```ts
/** URL of a mirrored CCTV frame on the snapshot host (key: cam/{jpsCameraId}.jpg). */
export function cameraImageUrl(baseUrl: string, jpsCameraId: string, capturedAt?: string | null): string {
    const base = baseUrl.replace(/\/+$/, "");
    const version = capturedAt ? `?v=${encodeURIComponent(capturedAt)}` : "";
    return `${base}/cam/${jpsCameraId}.jpg${version}`;
}
```

- [ ] **Step 4: Use it in the three consumers**

`src/components/CameraCard.tsx`:
- Add imports: `import { cameraImageUrl } from "@/lib/cameraImageUrl";`, `import { snapshotBaseUrl } from "@/lib/snapshotEnv";`, `import formatTimestamp from "@/utils/timeUtils";`
- In `interface Camera` add `captured_at?: string | null`.
- Replace `const imageUrl = \`/api/proxy-image/${camera.jps_camera_id}\`` with `const imageUrl = cameraImageUrl(snapshotBaseUrl(), camera.jps_camera_id, camera.captured_at)`.
- Directly after the `<img … src={imageUrl} …/>` element, add the caption:

```tsx
                        {camera.captured_at && (
                            <span className="absolute bottom-1 right-2 text-[11px] text-white/90 bg-black/50 px-1.5 py-0.5 rounded">
                                Captured {formatTimestamp(camera.captured_at)}
                            </span>
                        )}
```

(The image wrapper must be `relative`; if it isn't, add `relative` to its className.)

`src/routes/cameras/index.tsx`: add the same two imports (`cameraImageUrl`, `snapshotBaseUrl`) and replace both `` `/api/proxy-image/${camera.jps_camera_id}` `` (line ~73) and `` `/api/proxy-image/${newCamera.jps_camera_id}` `` (line ~103) with `cameraImageUrl(snapshotBaseUrl(), camera.jps_camera_id, camera.captured_at)` / `cameraImageUrl(snapshotBaseUrl(), newCamera.jps_camera_id, newCamera.captured_at)`.

`src/routes/stations/$id.tsx`: add the same imports and replace both `` `/api/proxy-image/${currentStation?.cameras?.jps_camera_id}` `` occurrences (lines ~442 and ~449) with `cameraImageUrl(snapshotBaseUrl(), currentStation.cameras.jps_camera_id, currentStation.cameras.captured_at)` (these lines are inside a `currentStation?.cameras` guard; if TypeScript complains, keep the optional chaining and pass `?? ""` for the id).

Confirm nothing is left: `grep -rn "proxy-image" src/` must print nothing.

- [ ] **Step 5: Replace the proxy SW rule in `vite.config.ts`**

Next to `snapshotJsonPattern` add:

```ts
    const cameraImagePattern = snapshotBase
        ? new RegExp(`^${escapeRegExp(snapshotBase)}/cam/.+\\.jpg`, "i")
        : /$^/;
```

Replace the whole `/api/proxy-image/` runtimeCaching entry with:

```ts
                    {
                        // Mirrored CCTV frames: show cached instantly, refresh in background
                        urlPattern: cameraImagePattern,
                        handler: "StaleWhileRevalidate",
                        options: {
                            cacheName: "camera-images",
                            expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
```

- [ ] **Step 6: Remove the Netlify function and redirect**

```bash
git rm netlify/functions/proxy-image.ts
```

In `netlify.toml` delete the block:

```toml
# Proxy image API route to Netlify function
[[redirects]]
  from = "/api/proxy-image/*"
  to = "/.netlify/functions/proxy-image/:splat"
  status = 200
```

- [ ] **Step 7: Verify**

```bash
npx vitest run && npm run lint && npm run build && grep -rn "proxy-image" src/ netlify/ vite.config.ts netlify.toml; echo "exit=$?"
```

Expected: tests/lint/build green; the grep prints nothing (`exit=1`). Open the deploy preview: camera cards load from `cdn.<domain>/cam/…`, captions show "Captured N minutes ago", fullscreen prev/next still works.

- [ ] **Step 8: Commit and ship Phase 3**

```bash
git add -A src/lib/cameraImageUrl.ts src/lib/__tests__/cameraImageUrl.test.ts src/components/CameraCard.tsx src/routes vite.config.ts netlify.toml netlify/functions
git commit -m "feat: serve camera images from R2 and remove the JPS proxy function"
```

Open the Phase-3 PR, merge when green (Convex crons deploy automatically).

---

## Phase 4 — Social share cards

### Task 16: Default OG tags + bot-only station meta edge function

**Files:**
- Modify: `index.html`
- Create: `netlify/edge-functions/lib/stationMeta.ts`
- Create: `netlify/edge-functions/station-meta.ts`
- Modify: `types/netlify-edge.d.ts`
- Test: `netlify/edge-functions/lib/__tests__/stationMeta.test.ts`

**Interfaces:**
- Produces: `isCrawler(userAgent: string | null): boolean`; `StationMetaInput` (subset of a `stations.json` item); `describeStation(station): string`; `buildStationMetaHtml({ siteUrl, stationId, station }): string`; `escapeHtml(text): string`; edge route `/stations/:id` (bots only).

- [ ] **Step 1: Default tags in `index.html`**

Inside `<head>`, after the `<meta name="description" …>` line, add:

```html
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="River Water Level" />
        <meta property="og:title" content="River Water Level" />
        <meta property="og:description" content="Current river water levels across Selangor — live even when InfoBanjir is down." />
        <meta property="og:image" content="https://riverlevel.netlify.app/opengraph-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
```

Ensure the image exists: `ls public/opengraph-image.png || git show origin/feature/danger-level-notifications:public/opengraph-image.png > public/opengraph-image.png`.

- [ ] **Step 2: Write the failing test**

`netlify/edge-functions/lib/__tests__/stationMeta.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isCrawler, describeStation, buildStationMetaHtml, escapeHtml } from "../stationMeta";

const station = {
    id: "abc",
    station_name: "SG KLANG <JAMBATAN>",
    districts: { name: "KLANG" },
    current_levels: { current_level: 2.346, alert_level: "3", updated_at: "2026-08-29T08:00:00.000Z" },
    station_status: true,
};

describe("isCrawler", () => {
    it("matches common link-preview bots", () => {
        expect(isCrawler("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe(true);
        expect(isCrawler("WhatsApp/2.23.20.0")).toBe(true);
        expect(isCrawler("TelegramBot (like TwitterBot)")).toBe(true);
        expect(isCrawler("Mozilla/5.0 (compatible; Discordbot/2.0)")).toBe(true);
    });
    it("does not match browsers or a missing header", () => {
        expect(isCrawler("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1")).toBe(false);
        expect(isCrawler(null)).toBe(false);
    });
});

describe("describeStation", () => {
    it("summarises level, alert label and district", () => {
        expect(describeStation(station)).toBe("Current water level: 2.35 m · Danger · KLANG district");
    });
    it("handles missing readings", () => {
        expect(describeStation({ ...station, current_levels: null })).toBe("No recent reading · KLANG district");
    });
});

describe("buildStationMetaHtml", () => {
    it("emits station-specific, escaped OG tags and a refresh to the SPA route", () => {
        const html = buildStationMetaHtml({ siteUrl: "https://riverlevel.netlify.app", stationId: "abc", station });
        expect(html).toContain('<meta property="og:title" content="SG KLANG &lt;JAMBATAN&gt; - River Water Level">');
        expect(html).toContain('<meta property="og:image" content="https://riverlevel.netlify.app/og/station/abc">');
        expect(html).toContain('<meta property="og:url" content="https://riverlevel.netlify.app/stations/abc">');
        expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
        expect(html).toContain('content="0;url=https://riverlevel.netlify.app/stations/abc"');
        expect(html).not.toContain("<JAMBATAN>");
    });
    it("falls back to generic copy when the station is unknown", () => {
        const html = buildStationMetaHtml({ siteUrl: "https://x.test", stationId: "nope", station: null });
        expect(html).toContain('<meta property="og:title" content="River Water Level">');
        expect(html).toContain("/og/station/nope");
    });
});

describe("escapeHtml", () => {
    it("escapes the five HTML metacharacters", () => {
        expect(escapeHtml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run netlify/edge-functions/lib/__tests__/stationMeta.test.ts
```

Expected: FAIL — cannot resolve `../stationMeta`.

- [ ] **Step 4: Create `netlify/edge-functions/lib/stationMeta.ts`**

```ts
// Pure helpers for the station-meta edge function. No Deno/Netlify imports so
// they run under Vitest too.

export const CRAWLER_UA =
    /facebookexternalhit|facebot|twitterbot|whatsapp|telegrambot|linkedinbot|slackbot|discordbot|googlebot|bingbot|pinterest|skypeuripreview|applebot/i;

export function isCrawler(userAgent: string | null): boolean {
    return !!userAgent && CRAWLER_UA.test(userAgent);
}

export interface StationMetaInput {
    id: string;
    station_name?: string;
    districts?: { name: string };
    current_levels?: { current_level: number; alert_level: string; updated_at?: string } | null;
    station_status?: boolean;
}

const ALERT_LABELS: Record<string, string> = { "0": "Normal", "1": "Alert", "2": "Warning", "3": "Danger" };

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function describeStation(station: StationMetaInput): string {
    const district = station.districts?.name ? ` · ${station.districts.name} district` : "";
    const levels = station.current_levels;
    if (!levels) return `No recent reading${district}`;
    const label = ALERT_LABELS[levels.alert_level] ?? "No data";
    return `Current water level: ${levels.current_level.toFixed(2)} m · ${label}${district}`;
}

export function buildStationMetaHtml(input: {
    siteUrl: string;
    stationId: string;
    station: StationMetaInput | null;
}): string {
    const siteUrl = input.siteUrl.replace(/\/+$/, "");
    const pageUrl = `${siteUrl}/stations/${encodeURIComponent(input.stationId)}`;
    const imageUrl = `${siteUrl}/og/station/${encodeURIComponent(input.stationId)}`;
    const title = input.station?.station_name
        ? `${input.station.station_name} - River Water Level`
        : "River Water Level";
    const description = input.station
        ? describeStation(input.station)
        : "Current river water levels across Selangor.";

    const tag = (attrs: string) => `<meta ${attrs}>`;
    return [
        "<!DOCTYPE html>",
        '<html lang="en"><head><meta charset="utf-8">',
        `<title>${escapeHtml(title)}</title>`,
        tag(`name="description" content="${escapeHtml(description)}"`),
        tag('property="og:type" content="website"'),
        tag('property="og:site_name" content="River Water Level"'),
        tag(`property="og:title" content="${escapeHtml(title)}"`),
        tag(`property="og:description" content="${escapeHtml(description)}"`),
        tag(`property="og:image" content="${imageUrl}"`),
        tag('property="og:image:width" content="1200"'),
        tag('property="og:image:height" content="630"'),
        tag(`property="og:url" content="${pageUrl}"`),
        tag('name="twitter:card" content="summary_large_image"'),
        tag(`name="twitter:title" content="${escapeHtml(title)}"`),
        tag(`name="twitter:description" content="${escapeHtml(description)}"`),
        tag(`name="twitter:image" content="${imageUrl}"`),
        tag(`http-equiv="refresh" content="0;url=${pageUrl}"`),
        `</head><body><a href="${pageUrl}">${escapeHtml(title)}</a></body></html>`,
    ].join("\n");
}
```

- [ ] **Step 5: Create `netlify/edge-functions/station-meta.ts`**

```ts
import type { Config, Context } from "https://edge.netlify.com/v1/mod.ts";
import { buildStationMetaHtml, isCrawler, type StationMetaInput } from "./lib/stationMeta.ts";

/**
 * Bots get a tiny HTML page with station-specific Open Graph tags (the SPA shell
 * can't carry them). Humans pass straight through to the static app — no compute.
 */
export default async (request: Request, context: Context) => {
    if (!isCrawler(request.headers.get("user-agent"))) {
        return context.next();
    }

    const stationId = context.params.id;
    const snapshotBase = (Netlify.env.get("VITE_SNAPSHOT_BASE_URL") ?? "").replace(/\/+$/, "");
    const siteUrl = Netlify.env.get("VITE_SITE_URL") ?? new URL(request.url).origin;

    let station: StationMetaInput | null = null;
    if (snapshotBase) {
        try {
            const response = await fetch(`${snapshotBase}/stations.json`);
            if (response.ok) {
                const body = (await response.json()) as { items: StationMetaInput[] };
                station = body.items.find((s) => s.id === stationId) ?? null;
            }
        } catch (error) {
            console.warn("station-meta: snapshot fetch failed", error);
        }
    }

    return new Response(buildStationMetaHtml({ siteUrl, stationId, station }), {
        headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, s-maxage=300",
        },
    });
};

export const config: Config = {
    path: "/stations/:id",
};
```

Append to `types/netlify-edge.d.ts`:

```ts
// Netlify global available inside Edge Functions
declare const Netlify: {
    env: {
        get(key: string): string | undefined;
    };
};
```

- [ ] **Step 6: Run tests, lint, build**

```bash
npx vitest run netlify && npm run lint && npm run build
```

Expected: 8 tests pass; lint/build unaffected (netlify/ is outside both).

- [ ] **Step 7: Verify on a deploy preview, then commit**

Push, open the Phase-4 PR; on the preview URL:

```bash
curl -s -A "facebookexternalhit/1.1" https://<preview>/stations/<a-real-id> | grep -o '<meta property="og:[a-z:]*" content="[^"]*"'
curl -s -A "Mozilla/5.0" https://<preview>/stations/<a-real-id> | grep -c 'id="root"'
```

Expected: the first prints station-specific `og:title`/`og:description`/`og:image`; the second prints `1` (humans get the SPA shell).

```bash
git add index.html public/opengraph-image.png netlify/edge-functions types/netlify-edge.d.ts
git commit -m "feat: serve station Open Graph tags to crawlers via edge function"
```

### Task 17: OG image renders from the snapshot

**Files:**
- Modify: `netlify/edge-functions/og-image.tsx:2, 227-253, 256-282`

**Interfaces:**
- Consumes: `stations.json` items (`station_name`, `districts.name`, `current_levels`, `station_status`, `cameras.jps_camera_id`, `cameras.is_enabled`); `cam/{id}.jpg` (Task 14).

- [ ] **Step 1: Pin the renderer import**

Line 2 → `import { ImageResponse } from "https://deno.land/x/og_edge@0.0.6/mod.ts";`

- [ ] **Step 2: Replace `getCurrentWaterLevel` (lines 227-253) with a snapshot lookup**

```tsx
interface SnapshotStationForOg {
    id: string;
    station_name: string;
    districts: { name: string };
    current_levels: { current_level: number; alert_level: string; updated_at?: string } | null;
    cameras: { jps_camera_id: string; is_enabled: boolean } | null;
    station_status: boolean;
}

const SNAPSHOT_BASE_URL = (Netlify.env.get("VITE_SNAPSHOT_BASE_URL") ?? "").replace(/\/+$/, "");

// One CDN-cached fetch; no Convex, no JPS. Returns null if the snapshot is unreachable.
async function getStationFromSnapshot(stationId: string): Promise<SnapshotStationForOg | null> {
    if (!SNAPSHOT_BASE_URL) return null;
    try {
        const response = await fetch(`${SNAPSHOT_BASE_URL}/stations.json`);
        if (!response.ok) {
            console.warn(`og-image: stations.json HTTP ${response.status}`);
            return null;
        }
        const body = (await response.json()) as { items: SnapshotStationForOg[] };
        return body.items.find((s) => s.id === stationId) ?? null;
    } catch (error) {
        console.warn("og-image: snapshot fetch failed", error);
        return null;
    }
}
```

- [ ] **Step 3: Replace the top of the handler (lines 256-282, down to `const lastUpdated = formatDateTime(updatedAt);`)**

```tsx
export default async (request: Request, context: Context) => {
    const { stationId } = context.params;

    if (!stationId) {
        return new Response("Station ID is required", { status: 400 });
    }

    const station = await getStationFromSnapshot(stationId);

    const stationName = station?.station_name ?? "Unknown Station";
    const district = station?.districts?.name ?? "Unknown District";
    const currentLevel = station?.current_levels?.current_level ?? 0;
    const alertLevel = station?.current_levels?.alert_level ?? "0";
    const updatedAt = station?.current_levels?.updated_at ?? new Date().toISOString();
    const isOnline = station?.station_status ?? false;
    const cameraUrl =
        station?.cameras?.is_enabled && station.cameras.jps_camera_id
            ? `${SNAPSHOT_BASE_URL}/cam/${station.cameras.jps_camera_id}.jpg`
            : null;
    const hasCameraImage = cameraUrl !== null;

    const alertInfo = getAlertInfo(alertLevel, isOnline);
    const lastUpdated = formatDateTime(updatedAt);
```

The two `ImageResponse` branches below are unchanged (`cameraUrl` is still the variable they read). Remove the now-unused `const url = new URL(request.url);` line if it remains.

- [ ] **Step 4: Add a cache header to both `ImageResponse` calls**

Change each `{ width: 1200, height: 630 }` to:

```tsx
            { width: 1200, height: 630, headers: { "cache-control": "public, s-maxage=300, max-age=300" } }
```

- [ ] **Step 5: Verify on the deploy preview**

```bash
curl -s -o /tmp/og.png -w "status=%{http_code} type=%{content_type} bytes=%{size_download}\n" https://<preview>/og/station/<a-real-id>
```

Expected: `status=200 type=image/png bytes=<tens of KB>`. Open `/tmp/og.png`: station name, district, level, coloured alert badge, and the camera thumbnail for a station with a camera. If the response is still 502, open Netlify → Deploy → Edge Functions logs: a failing Deno import is the usual cause — try `og_edge@0.0.5` or the `https://esm.sh/react@18.2.0` pin, and record what worked in the commit message.

- [ ] **Step 6: Commit and ship Phase 4**

```bash
git add netlify/edge-functions/og-image.tsx
git commit -m "fix: render station OG image from the R2 snapshot"
```

Merge the Phase-4 PR when green. Re-test the production URL with a real share (WhatsApp/Telegram) — both show a station card with the current level.

---

## Phase 5 — Cleanup

### Task 18: Remove the Convex read path from the frontend

**Files:**
- Modify: `src/hooks/useStations.ts`, `src/hooks/useCameras.ts`, `src/hooks/useStationDetail.ts`, `src/hooks/useWaterLevelHistory.ts`
- Modify: `src/lib/snapshotEnv.ts`
- Modify: `src/routes/__root.tsx`
- Delete: `src/lib/convexClient.ts`
- Modify: `vite.config.ts`, `src/vite-env.d.ts`, `.env.example`, `netlify.toml`, `README.md`
- Modify: `convex/waterLevelHistory.ts` (delete `getMultipleStationsTrend`, unused)

- [ ] **Step 1: Collapse the hooks to the snapshot implementation**

In each of the four hook files: delete the `*Convex` function, the `useQuery`/`api`/`Id` imports and the `dataSource` import, and export the snapshot implementation directly, e.g. `src/hooks/useStations.ts` becomes:

```ts
import { useSnapshot } from "@/hooks/useSnapshot";
import type { StationsSnapshot } from "@/lib/snapshotTypes";

/** All stations with details, from the R2 snapshot (polled, ETag-revalidated). */
export function useStations() {
    const { data } = useSnapshot<StationsSnapshot>("stations");
    return { data: data?.items, isLoading: data === undefined };
}
```

Apply the same collapse to `useCameras`, `useStationDetail` (keep the `useMemo` lookup) and `useStationTrend` (keep `EMPTY`).

- [ ] **Step 2: Remove the switch and the Convex client**

- `src/lib/snapshotEnv.ts`: delete `dataSource()`.
- `src/routes/__root.tsx`: remove `import { ConvexProvider } from "convex/react";`, `import { convex } from "@/lib/convexClient";`, and the `<ConvexProvider client={convex}>` … `</ConvexProvider>` wrapper (keep its children).
- `git rm src/lib/convexClient.ts`.
- `src/vite-env.d.ts`: delete `VITE_CONVEX_URL` and `VITE_DATA_SOURCE`.
- `.env.example`: delete `VITE_CONVEX_URL=…` and `VITE_DATA_SOURCE=…` lines (keep `CONVEX_DEPLOY_KEY`; it is still used by CI to deploy the backend).
- `netlify.toml`: delete the `# VITE_CONVEX_URL must be set …` comment; update the dashboard comment to list only `VITE_SNAPSHOT_BASE_URL` and `VITE_SITE_URL`.
- `vite.config.ts`: delete the `convex.cloud` runtimeCaching rule.
- `convex/waterLevelHistory.ts`: delete `getMultipleStationsTrend` (never called).
- `src/hooks/__tests__/snapshotDataHooks.test.tsx`: delete the `vi.stubEnv("VITE_DATA_SOURCE", …)` line.

- [ ] **Step 3: Verify nothing in `src/` imports Convex at runtime**

```bash
grep -rn "convex/react\|convexClient\|VITE_CONVEX_URL\|VITE_DATA_SOURCE" src/ vite.config.ts netlify.toml .env.example; echo "exit=$?"
npx vitest run && npm run lint && npm run build
```

Expected: grep prints nothing (`exit=1`); type-only imports of `convex/_generated/api` in `src/lib/snapshotTypes.ts` are fine (they are erased at build). All green.

- [ ] **Step 4: Update `README.md`**

In the tech-stack / architecture section, replace the Convex-reads description with:

```markdown
### Data flow

1. A Convex cron scrapes the JPS Selangor API every 5 minutes (skipping unchanged data) and stores readings in Convex.
2. After each run it publishes `stations.json`, `cameras.json`, `trends.json` and `meta.json` to a Cloudflare R2 bucket served from `VITE_SNAPSHOT_BASE_URL`; CCTV frames are mirrored to `cam/{id}.jpg` every 15 minutes (5 minutes for stations at alert level or above).
3. The frontend reads only those static files (ETag-polled every 2 minutes, cached in localStorage and the service worker), so the site stays up when JPS is down and costs nothing under a traffic spike. The browser never connects to Convex.
4. Danger push notifications (OneSignal) are still scheduled from the Convex scraper.

See `docs/superpowers/specs/2026-08-29-resilient-read-path-design.md`.
```

Also list the new env vars where the README documents `.env` setup.

- [ ] **Step 5: Commit and ship Phase 5**

```bash
git add -A src convex vite.config.ts .env.example netlify.toml README.md
git commit -m "chore: remove Convex read path from the frontend; snapshot is the only data source"
```

Open the Phase-5 PR, merge when green, then remove `VITE_CONVEX_URL` and `VITE_DATA_SOURCE` from the Netlify dashboard. Final production checks: no `convex.cloud` requests in DevTools; `npm run build` warns about nothing; a shared station link previews correctly.
