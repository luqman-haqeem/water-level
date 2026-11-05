import { describe, it, expect } from "vitest";
import {
    ALERT_UNKNOWN,
    computeAlertLevel,
    hasUsableThresholds,
    applyStalenessGate,
} from "../lib/alertClassification";

/**
 * Regression tests for #73 [A1] — alert classification must fail *safe*.
 *
 * Three failure modes are covered:
 *   1. Missing / zero thresholds must never classify as DANGER.
 *   2. An unrecognised upstream status must never classify as NORMAL.
 *   3. A stale reading must not retain a non-Normal classification.
 */

/** A station with sane, ascending thresholds and a live reading. */
function station(overrides: Partial<Parameters<typeof computeAlertLevel>[0]> = {}) {
    return {
        currentWaterLevel: 1.2,
        normalLevel: 1.0,
        alertLevel: 2.0,
        warningLevel: 3.0,
        dangerLevel: 4.0,
        waterlevelStatus: -1,
        ...overrides,
    };
}

describe("computeAlertLevel — upstream status codes", () => {
    it.each([
        [3, 3, "danger"],
        [2, 2, "warning"],
        [1, 1, "alert"],
        [0, 0, "normal"],
    ])("maps status %i to %i (%s)", (status, expected) => {
        expect(computeAlertLevel(station({ waterlevelStatus: status }))).toBe(
            expected
        );
    });

    it("returns unknown when the reading is null", () => {
        expect(
            computeAlertLevel(station({ currentWaterLevel: null }))
        ).toBe(ALERT_UNKNOWN);
    });

    // ── Failure mode 2: unknown status became Normal ──────────────────────────
    it.each([4, 7, 99, -2, -9999])(
        "returns unknown for unrecognised status %i, never Normal",
        (status) => {
            const level = computeAlertLevel(
                station({ waterlevelStatus: status })
            );
            expect(level).toBe(ALERT_UNKNOWN);
            expect(level).not.toBe(0);
        }
    );

    it("returns unknown when the status is not a finite number", () => {
        expect(
            computeAlertLevel(station({ waterlevelStatus: NaN }))
        ).toBe(ALERT_UNKNOWN);
    });
});

describe("computeAlertLevel — threshold fallback (status -1)", () => {
    it("classifies against thresholds when they are usable", () => {
        expect(
            computeAlertLevel(station({ currentWaterLevel: 4.5 }))
        ).toBe(3);
        expect(
            computeAlertLevel(station({ currentWaterLevel: 3.5 }))
        ).toBe(2);
        expect(
            computeAlertLevel(station({ currentWaterLevel: 2.5 }))
        ).toBe(1);
        expect(
            computeAlertLevel(station({ currentWaterLevel: 0.5 }))
        ).toBe(0);
    });

    it("treats a reading exactly at a threshold as that level", () => {
        expect(computeAlertLevel(station({ currentWaterLevel: 4.0 }))).toBe(3);
        expect(computeAlertLevel(station({ currentWaterLevel: 3.0 }))).toBe(2);
        expect(computeAlertLevel(station({ currentWaterLevel: 2.0 }))).toBe(1);
    });

    // ── Failure mode 1: missing thresholds became DANGER ──────────────────────
    it("returns unknown when every threshold is zero, never Danger", () => {
        const level = computeAlertLevel(
            station({ alertLevel: 0, warningLevel: 0, dangerLevel: 0 })
        );
        expect(level).toBe(ALERT_UNKNOWN);
        expect(level).not.toBe(3);
    });

    it.each([
        ["danger", { dangerLevel: 0 }],
        ["warning", { warningLevel: 0 }],
        ["alert", { alertLevel: 0 }],
    ])(
        "returns unknown when the %s threshold is zero",
        (_name, overrides) => {
            expect(computeAlertLevel(station(overrides))).toBe(ALERT_UNKNOWN);
        }
    );

    it("returns unknown when a threshold is negative or non-finite", () => {
        expect(
            computeAlertLevel(station({ dangerLevel: -1 }))
        ).toBe(ALERT_UNKNOWN);
        expect(
            computeAlertLevel(station({ warningLevel: NaN }))
        ).toBe(ALERT_UNKNOWN);
    });

    it("returns unknown when thresholds are not ascending", () => {
        expect(
            computeAlertLevel(
                station({ alertLevel: 4.0, warningLevel: 3.0, dangerLevel: 2.0 })
            )
        ).toBe(ALERT_UNKNOWN);
    });

    it("does not let a zero reading with zero thresholds read as Danger", () => {
        // The exact production shape: `wlth_* || 0` coalescing plus a 0 reading.
        const level = computeAlertLevel(
            station({
                currentWaterLevel: 0,
                normalLevel: 0,
                alertLevel: 0,
                warningLevel: 0,
                dangerLevel: 0,
            })
        );
        expect(level).toBe(ALERT_UNKNOWN);
    });
});

describe("hasUsableThresholds", () => {
    it("accepts positive ascending thresholds", () => {
        expect(
            hasUsableThresholds({ alertLevel: 1, warningLevel: 2, dangerLevel: 3 })
        ).toBe(true);
    });

    it("accepts equal adjacent thresholds", () => {
        expect(
            hasUsableThresholds({ alertLevel: 2, warningLevel: 2, dangerLevel: 3 })
        ).toBe(true);
    });

    it("rejects zero, negative, non-finite, and descending thresholds", () => {
        expect(
            hasUsableThresholds({ alertLevel: 0, warningLevel: 2, dangerLevel: 3 })
        ).toBe(false);
        expect(
            hasUsableThresholds({ alertLevel: 1, warningLevel: -2, dangerLevel: 3 })
        ).toBe(false);
        expect(
            hasUsableThresholds({
                alertLevel: 1,
                warningLevel: 2,
                dangerLevel: Infinity,
            })
        ).toBe(false);
        expect(
            hasUsableThresholds({ alertLevel: 3, warningLevel: 2, dangerLevel: 1 })
        ).toBe(false);
    });
});

// ── Failure mode 3: stale readings retained a non-Normal classification ───────
describe("applyStalenessGate", () => {
    const now = new Date("2026-09-02T00:00:00.000Z").getTime();
    const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

    const MINUTE = 60_000;
    const DAY = 86_400_000;

    it("keeps a fresh classification untouched", () => {
        expect(applyStalenessGate(3, iso(5 * MINUTE), now)).toBe(3);
        expect(applyStalenessGate(2, iso(5 * MINUTE), now)).toBe(2);
        expect(applyStalenessGate(1, iso(5 * MINUTE), now)).toBe(1);
        expect(applyStalenessGate(0, iso(5 * MINUTE), now)).toBe(0);
    });

    it("keeps a reading just inside the 45-minute window", () => {
        expect(applyStalenessGate(3, iso(44 * MINUTE), now)).toBe(3);
    });

    it("downgrades a reading past the 45-minute window to unknown", () => {
        expect(applyStalenessGate(3, iso(46 * MINUTE), now)).toBe(ALERT_UNKNOWN);
        expect(applyStalenessGate(2, iso(46 * MINUTE), now)).toBe(ALERT_UNKNOWN);
        expect(applyStalenessGate(1, iso(46 * MINUTE), now)).toBe(ALERT_UNKNOWN);
    });

    it("downgrades a stale Normal reading too — it is not evidence of safety", () => {
        expect(applyStalenessGate(0, iso(46 * MINUTE), now)).toBe(ALERT_UNKNOWN);
    });

    it("returns unknown when updatedAt is missing or unparseable", () => {
        expect(applyStalenessGate(3, undefined, now)).toBe(ALERT_UNKNOWN);
        expect(applyStalenessGate(3, "", now)).toBe(ALERT_UNKNOWN);
        expect(applyStalenessGate(3, "not-a-date", now)).toBe(ALERT_UNKNOWN);
    });

    it("leaves an already-unknown classification unknown", () => {
        expect(
            applyStalenessGate(ALERT_UNKNOWN, iso(MINUTE), now)
        ).toBe(ALERT_UNKNOWN);
    });

    // The two real stations named in #73, observed against production 2 Sep 2026.
    it("downgrades T.N.B PANGSUN — Warning on a 114-day-old reading", () => {
        expect(applyStalenessGate(2, iso(114 * DAY), now)).toBe(ALERT_UNKNOWN);
    });

    it("downgrades KG. PASIR — Alert on a 58-day-old reading", () => {
        expect(applyStalenessGate(1, iso(58 * DAY), now)).toBe(ALERT_UNKNOWN);
    });

    it("never lets a stale reading reach the danger notification trigger", () => {
        const stale = applyStalenessGate(3, iso(114 * DAY), now);
        expect(stale === 3).toBe(false);
    });
});
