import { describe, it, expect } from "vitest";
import { formatThreshold } from "../thresholds";

describe("formatThreshold", () => {
    it("renders a known threshold with its unit", () => {
        expect(formatThreshold(2.6)).toBe("2.6m");
    });

    it("says so when a threshold is absent, rather than rendering a bare unit", () => {
        // Interpolating null straight into JSX produced "m" with no number.
        expect(formatThreshold(null)).toBe("Not published");
    });

    it("does not treat 0 as absent", () => {
        // 0 should never reach the UI as a threshold any more, but if it does it
        // must not be silently relabelled as missing.
        expect(formatThreshold(0)).toBe("0m");
    });
});
