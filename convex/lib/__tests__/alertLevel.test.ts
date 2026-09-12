import { describe, it, expect } from "vitest";
import {
    ALERT_LEVEL,
    classifyByThresholds,
    computeAlertLevel,
    parseThreshold,
} from "../alertLevel";

describe("parseThreshold", () => {
    it("keeps real thresholds", () => {
        expect(parseThreshold(2.6)).toBe(2.6);
        expect(parseThreshold("3.15")).toBe(3.15);
    });

    it("treats 0 as absent, not as a threshold of zero", () => {
        // The whole of #73 starts here: `wlth_danger || 0` made these
        // indistinguishable, and `level >= 0` is true for every reading.
        expect(parseThreshold(0)).toBeUndefined();
        expect(parseThreshold("0")).toBeUndefined();
    });

    it("treats JPS null sentinels and junk as absent", () => {
        expect(parseThreshold(-9999)).toBeUndefined();
        expect(parseThreshold(null)).toBeUndefined();
        expect(parseThreshold(undefined)).toBeUndefined();
        expect(parseThreshold("")).toBeUndefined();
        expect(parseThreshold("n/a")).toBeUndefined();
        expect(parseThreshold(NaN)).toBeUndefined();
    });
});

describe("classifyByThresholds", () => {
    const full = { alertLevel: 1, warningLevel: 2, dangerLevel: 3 };

    it("classifies against a complete threshold set", () => {
        expect(classifyByThresholds(0.5, full)).toBe(ALERT_LEVEL.normal);
        expect(classifyByThresholds(1.0, full)).toBe(ALERT_LEVEL.alert);
        expect(classifyByThresholds(2.5, full)).toBe(ALERT_LEVEL.warning);
        expect(classifyByThresholds(3.1, full)).toBe(ALERT_LEVEL.danger);
    });

    it("returns unknown - never danger - when no thresholds are known", () => {
        expect(classifyByThresholds(0.42, {})).toBe(ALERT_LEVEL.unknown);
        expect(classifyByThresholds(0, {})).toBe(ALERT_LEVEL.unknown);
        expect(classifyByThresholds(9999, {})).toBe(ALERT_LEVEL.unknown);
    });

    it("returns unknown when only a normal level is known", () => {
        // `normal` carries no safety meaning on its own.
        expect(classifyByThresholds(5, { normalLevel: 1 })).toBe(ALERT_LEVEL.unknown);
    });

    it("uses only the thresholds it has, and does not promote to a missing one", () => {
        // Danger absent: a reading above warning is Warning, not Danger.
        expect(classifyByThresholds(99, { alertLevel: 1, warningLevel: 2 })).toBe(
            ALERT_LEVEL.warning
        );
        // Warning absent: skips straight from alert to danger.
        expect(classifyByThresholds(2.5, { alertLevel: 1, dangerLevel: 3 })).toBe(
            ALERT_LEVEL.alert
        );
    });
});

describe("computeAlertLevel", () => {
    const thresholds = { alertLevel: 1, warningLevel: 2, dangerLevel: 3 };

    it("trusts an explicit JPS status", () => {
        for (const status of [0, 1, 2, 3]) {
            expect(
                computeAlertLevel({
                    currentWaterLevel: 0.1,
                    waterlevelStatus: status,
                    ...thresholds,
                })
            ).toBe(status);
        }
    });

    it("returns unknown when there is no reading", () => {
        expect(
            computeAlertLevel({ currentWaterLevel: null, waterlevelStatus: 3, ...thresholds })
        ).toBe(ALERT_LEVEL.unknown);
    });

    it("returns unknown for an unrecognised upstream status", () => {
        // Was `default: return 0` — an upstream state we do not understand was
        // reported to users as Normal, i.e. as safe (#73).
        for (const status of [4, 7, 99, -2, null, undefined]) {
            expect(
                computeAlertLevel({
                    currentWaterLevel: 0.1,
                    waterlevelStatus: status,
                    ...thresholds,
                })
            ).toBe(ALERT_LEVEL.unknown);
        }
    });

    it("falls back to thresholds when JPS reports -1", () => {
        expect(
            computeAlertLevel({ currentWaterLevel: 3.4, waterlevelStatus: -1, ...thresholds })
        ).toBe(ALERT_LEVEL.danger);
        expect(
            computeAlertLevel({ currentWaterLevel: 0.4, waterlevelStatus: -1, ...thresholds })
        ).toBe(ALERT_LEVEL.normal);
    });

    it("a station with no thresholds is unknown, not DANGER", () => {
        // The regression that mattered: thresholds coalesced to 0 plus the -1
        // fallback made `currentWaterLevel >= 0` true, so any reading from a
        // station JPS publishes no thresholds for classified as Danger — and
        // Danger is a push-notification trigger.
        const result = computeAlertLevel({
            currentWaterLevel: 0.35,
            waterlevelStatus: -1,
            normalLevel: parseThreshold(0),
            alertLevel: parseThreshold(0),
            warningLevel: parseThreshold(0),
            dangerLevel: parseThreshold(0),
        });

        expect(result).toBe(ALERT_LEVEL.unknown);
        expect(result).not.toBe(ALERT_LEVEL.danger);
    });

    it("end-to-end over raw JPS field values", () => {
        // Shape as it arrives from the district endpoint, thresholds unset.
        const raw = {
            waterLevel: 1.27,
            wlth_normal: 0,
            wlth_alert: 0,
            wlth_warning: 0,
            wlth_danger: 0,
            waterlevelStatus: 0,
        };

        expect(
            computeAlertLevel({
                currentWaterLevel: raw.waterLevel,
                // `?? -1`, not `|| -1`: a genuine 0 ("normal") must survive.
                waterlevelStatus: raw.waterlevelStatus ?? -1,
                normalLevel: parseThreshold(raw.wlth_normal),
                alertLevel: parseThreshold(raw.wlth_alert),
                warningLevel: parseThreshold(raw.wlth_warning),
                dangerLevel: parseThreshold(raw.wlth_danger),
            })
        ).toBe(ALERT_LEVEL.normal);

        // Same station, but JPS omits the status too -> we must not guess.
        expect(
            computeAlertLevel({
                currentWaterLevel: raw.waterLevel,
                waterlevelStatus: null ?? -1,
                normalLevel: parseThreshold(raw.wlth_normal),
                alertLevel: parseThreshold(raw.wlth_alert),
                warningLevel: parseThreshold(raw.wlth_warning),
                dangerLevel: parseThreshold(raw.wlth_danger),
            })
        ).toBe(ALERT_LEVEL.unknown);
    });
});
