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
