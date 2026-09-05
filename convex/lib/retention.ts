/**
 * The two history windows. They were the same number by coincidence, which is
 * why raising one used to mean raising the other.
 *
 * - TRENDS_WINDOW_MS  — how much history the *public snapshot* exposes.
 * - HISTORY_RETENTION_MS — how long rows are *kept* before cleanup deletes them.
 *
 * Both were 3 hours, so the app accumulated no history at all: every row was
 * deleted almost as soon as it stopped being displayed (#80). Rate of rise
 * (#82), time-to-threshold, and any record of what a gauge read during a past
 * flood all need a window longer than the one the UI draws.
 *
 * Pure and dependency-free so it ports to the Worker unchanged (#67 Phase 1).
 */

/**
 * Window published in trends.json. Deliberately unchanged at 3 hours.
 *
 * Raising this would grow every snapshot publish and change the public contract
 * — including the golden files #67 uses to prove the Cloudflare Worker produces
 * byte-identical output. Retention and presentation are now independent, so
 * history can accrue without touching either.
 */
export const TRENDS_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * How long waterLevelHistory rows are retained: 14 days.
 *
 * Not the 12 months #80 ultimately wants, and that is a storage limit rather
 * than a preference. Convex's Free plan caps total storage at 0.5 GB, and their
 * limits page is explicit that this "includes database rows and indexes" with
 * "each index priced as another copy of the table". waterLevelHistory carries
 * three indexes, so a row costs roughly four times its own size:
 *
 *   ~120 B/row x 4 (table + 3 indexes)  ~= 0.5 KB effective
 *   ~1,000 rows/hour (per #80)          ~= 24k rows/day ~= 12 MB/day
 *
 *   3 hours ->     ~1.5 MB
 *   14 days ->    ~165 MB   (~33% of the cap, room for the other tables)
 *   30 days ->    ~345 MB   (~69% — too close)
 *   12 months ->  ~4.2 GB   (8x over)
 *
 * Overrunning the cap does not merely stop growth: on the Free plan mutations
 * that try to commit new insertions can start failing, which would stop the sync
 * outright. On a flood-warning app that is a worse outcome than short retention,
 * so this stays conservative while the data still lives in Convex.
 *
 * Full-season and 12-month retention are cheap once history moves to R2 (free
 * egress, 10 GB free storage) — that belongs with the archive work in #80, not
 * here. This change exists so that the season currently in progress is not being
 * discarded three hours at a time while that lands, since it cannot be
 * backfilled.
 */
export const HISTORY_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Deletion capacity per cleanup run, sized against the write rate.
 *
 * The old 250 x 8 = 2,000 per 4-hour run was below the ~4,000 rows written in
 * the same period, so the table grew regardless of the cutoff — retention was
 * never actually enforced at any value. 500 x 16 = 8,000 is ~2x the write rate,
 * which holds steady state and drains a backlog, while staying well inside
 * Convex's per-mutation ceilings (16,000 documents written, 32,000 scanned).
 */
export const CLEANUP_BATCH_SIZE = 500;
export const CLEANUP_MAX_BATCHES_PER_RUN = 16;
