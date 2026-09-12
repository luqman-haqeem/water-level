import { describe, it, expect } from "vitest";
import {
    CLEANUP_BATCH_SIZE,
    CLEANUP_MAX_BATCHES_PER_RUN,
    HISTORY_RETENTION_MS,
    TRENDS_WINDOW_MS,
} from "../retention";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("history windows", () => {
    it("publishes a 3-hour trend window", () => {
        // trends.json must not change shape or size in this PR: #67's golden-file
        // equivalence test compares the Worker's output byte-for-byte against it.
        expect(TRENDS_WINDOW_MS).toBe(3 * HOUR);
    });

    it("retains history for far longer than it publishes", () => {
        // The bug in #80 was that these were the same value, so rows were deleted
        // as soon as they left the chart and no history ever accumulated.
        expect(HISTORY_RETENTION_MS).toBeGreaterThan(TRENDS_WINDOW_MS);
        expect(HISTORY_RETENTION_MS).toBe(14 * DAY);
    });

    it("stays inside the Convex Free storage budget", () => {
        // Free plan: 0.5 GB total, and storage counts indexes as extra copies of
        // the table. waterLevelHistory has 3 indexes, so ~4x per row. Exceeding
        // the cap can make write mutations fail, which would stop the sync — so
        // this is a hard ceiling, not a soft preference.
        const BYTES_PER_ROW = 120;
        const INDEX_MULTIPLIER = 4;
        const ROWS_PER_HOUR = 1_000;
        const FREE_PLAN_BYTES = 0.5 * 1024 ** 3;

        const rows = (HISTORY_RETENTION_MS / HOUR) * ROWS_PER_HOUR;
        const bytes = rows * BYTES_PER_ROW * INDEX_MULTIPLIER;

        // Comfortably under, with room for stations/currentLevels/cameras.
        expect(bytes).toBeLessThan(FREE_PLAN_BYTES * 0.5);
    });
});

describe("cleanup capacity", () => {
    // Cron interval for cleanupOldHistoryData (convex/crons.ts).
    const RUN_INTERVAL_HOURS = 4;
    const ROWS_PER_HOUR = 1_000;

    it("can delete faster than rows are written", () => {
        // The old 250 x 8 = 2,000 per 4-hour run lost to the ~4,000 rows written
        // in the same period, so the table grew no matter what the cutoff said —
        // retention was not actually enforced at any value.
        const perRun = CLEANUP_BATCH_SIZE * CLEANUP_MAX_BATCHES_PER_RUN;
        const writtenBetweenRuns = ROWS_PER_HOUR * RUN_INTERVAL_HOURS;

        expect(perRun).toBeGreaterThan(writtenBetweenRuns);
        // Headroom to drain a backlog, not just hold steady state.
        expect(perRun).toBeGreaterThanOrEqual(writtenBetweenRuns * 2);
    });

    it("stays inside Convex per-mutation limits", () => {
        // Documented per-mutation ceilings: 16,000 documents written, 32,000
        // scanned. Cleanup reads and deletes the same rows, so both apply.
        const perRun = CLEANUP_BATCH_SIZE * CLEANUP_MAX_BATCHES_PER_RUN;

        expect(perRun).toBeLessThanOrEqual(16_000);
        expect(perRun).toBeLessThanOrEqual(32_000);
    });
});
