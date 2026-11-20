/**
 * Dead-man's switch for the R2 snapshot (#67).
 *
 * After cutover Cloudflare is the writer, the store and the delivery path, so a
 * Cloudflare-side failure takes out all three with nothing on Cloudflare left to
 * notice. This runs from GitHub Actions instead (.github/workflows/snapshot-watchdog.yml)
 * and only reads the public `meta.json`.
 *
 * Freshness is the age of `syncedAt`, never `status`: with no attempts at all, `status`
 * stays "ok" forever while the data rots (see "status is not a freshness signal" in
 * docs/superpowers/plans/2026-09-02-cloudflare-workers-migration.md).
 *
 * Usage: node scripts/snapshotWatchdog.mjs <snapshot base URL> [max age minutes]
 * Prints one JSON line `{ stale, reason, ... }` and exits 0 either way; the workflow
 * turns `stale` into an issue.
 */

/**
 * The longest gap between changed staging runs over 2026-11-19/20 was 45 min, and
 * 30 min gaps were routine (JPS updates irregularly), so the plan's ~30 min would
 * alert constantly. 90 min is two missed cycles past the worst observed gap.
 */
export const DEFAULT_MAX_AGE_MINUTES = 90;

/** Pure: decides whether a parsed meta.json (or null when unreachable) is stale. */
export function assess(meta, now, maxAgeMinutes = DEFAULT_MAX_AGE_MINUTES) {
    if (!meta) return { stale: true, reason: "meta.json unreachable" };

    const syncedMs = Date.parse(meta.syncedAt ?? "");
    if (Number.isNaN(syncedMs)) return { stale: true, reason: "meta.json has no valid syncedAt", meta };

    const ageMinutes = Math.round((now - syncedMs) / 60_000);
    const attemptMs = Date.parse(meta.attemptedAt ?? "");
    const attemptAgeMinutes = Number.isNaN(attemptMs) ? null : Math.round((now - attemptMs) / 60_000);
    const stale = ageMinutes > maxAgeMinutes;

    // Which half failed decides what to look at: no attempts means the writers stopped
    // (Cloudflare cron, standby); recent attempts with old data means JPS is down.
    let reason = "fresh";
    if (stale) {
        reason =
            attemptAgeMinutes !== null && attemptAgeMinutes <= maxAgeMinutes
                ? `data ${ageMinutes} min old, but a sync was attempted ${attemptAgeMinutes} min ago — upstream (JPS) is likely failing`
                : `no sync attempt for ${attemptAgeMinutes ?? "?"} min — the publishers have stopped`;
    }

    return {
        stale,
        reason,
        ageMinutes,
        attemptAgeMinutes,
        status: meta.status ?? null,
        publisher: meta.publisher ?? "worker",
        syncedAt: meta.syncedAt,
        attemptedAt: meta.attemptedAt ?? null,
    };
}

/** Three tries, so one dropped request to r2.dev does not open an issue. */
async function fetchMeta(baseUrl, tries = 3) {
    const url = `${baseUrl.replace(/\/+$/, "")}/meta.json`;
    for (let i = 1; i <= tries; i++) {
        try {
            const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
            if (res.ok) return await res.json();
            console.error(`GET ${url}: HTTP ${res.status} (try ${i}/${tries})`);
        } catch (error) {
            console.error(`GET ${url}: ${error} (try ${i}/${tries})`);
        }
        if (i < tries) await new Promise((r) => setTimeout(r, 10_000));
    }
    return null;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
    const [baseUrl, maxAge] = process.argv.slice(2);
    if (!baseUrl) {
        console.error("usage: node scripts/snapshotWatchdog.mjs <snapshot base URL> [max age minutes]");
        process.exit(2);
    }
    const result = assess(await fetchMeta(baseUrl), Date.now(), maxAge ? Number(maxAge) : undefined);
    console.log(JSON.stringify(result));
}
