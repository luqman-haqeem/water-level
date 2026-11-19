import { describe, it, expect } from "vitest";
import { STALENESS_THRESHOLD_MS } from "../../src/utils/timeUtils";
import {
  computeAlertLevel,
  STALENESS_MS,
  UNKNOWN_ALERT_LEVEL,
  type AlertLevelInput,
} from "../lib/alertLevel";

const NOW = Date.parse("2026-09-02T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function reading(overrides: Partial<AlertLevelInput> = {}): AlertLevelInput {
  return {
    currentWaterLevel: 2.0,
    waterlevelStatus: -1,
    alertLevel: 3.0,
    warningLevel: 4.0,
    dangerLevel: 5.0,
    lastUpdate: minutesAgo(5),
    ...overrides,
  };
}

describe("computeAlertLevel", () => {
  it("keeps the backend staleness window in sync with the frontend", () => {
    expect(STALENESS_MS).toBe(STALENESS_THRESHOLD_MS);
  });

  it("returns unknown when there is no reading", () => {
    expect(computeAlertLevel(reading({ currentWaterLevel: null }), NOW)).toBe(
      UNKNOWN_ALERT_LEVEL
    );
  });

  describe("explicit JPS status", () => {
    it.each([0, 1, 2, 3])("passes through status %i for fresh data", (s) => {
      expect(computeAlertLevel(reading({ waterlevelStatus: s }), NOW)).toBe(s);
    });

    it.each([4, 7, -2, 99, NaN])(
      "returns unknown, not Normal, for unrecognised status %s",
      (s) => {
        expect(computeAlertLevel(reading({ waterlevelStatus: s }), NOW)).toBe(
          UNKNOWN_ALERT_LEVEL
        );
      }
    );
  });

  describe("threshold fallback (status -1)", () => {
    it.each([
      [2.0, 0],
      [3.0, 1],
      [4.5, 2],
      [5.0, 3],
      [9.0, 3],
    ])("classifies %f m as level %i", (level, expected) => {
      expect(
        computeAlertLevel(reading({ currentWaterLevel: level }), NOW)
      ).toBe(expected);
    });

    it("returns unknown, not Danger, when all thresholds are missing", () => {
      // The sync coalesces absent thresholds to 0; previously any reading
      // >= 0 then classified as Danger and paged subscribers.
      expect(
        computeAlertLevel(
          reading({ alertLevel: 0, warningLevel: 0, dangerLevel: 0 }),
          NOW
        )
      ).toBe(UNKNOWN_ALERT_LEVEL);
    });

    it.each([
      ["alertLevel", { alertLevel: 0 }],
      ["warningLevel", { warningLevel: 0 }],
      ["dangerLevel", { dangerLevel: 0 }],
      ["dangerLevel (NaN)", { dangerLevel: NaN }],
    ])("returns unknown when %s is missing", (_name, overrides) => {
      expect(
        computeAlertLevel(reading({ currentWaterLevel: 9, ...overrides }), NOW)
      ).toBe(UNKNOWN_ALERT_LEVEL);
    });

    it("returns unknown when thresholds are out of order", () => {
      expect(
        computeAlertLevel(
          reading({ alertLevel: 5, warningLevel: 4, dangerLevel: 3 }),
          NOW
        )
      ).toBe(UNKNOWN_ALERT_LEVEL);
    });
  });

  describe("staleness", () => {
    it("classifies a reading just inside the window", () => {
      expect(
        computeAlertLevel(
          reading({ waterlevelStatus: 3, lastUpdate: minutesAgo(44) }),
          NOW
        )
      ).toBe(3);
    });

    it("returns unknown for a reading just outside the window", () => {
      expect(
        computeAlertLevel(
          reading({ waterlevelStatus: 3, lastUpdate: minutesAgo(46) }),
          NOW
        )
      ).toBe(UNKNOWN_ALERT_LEVEL);
    });

    it("returns unknown for an unparseable timestamp", () => {
      expect(
        computeAlertLevel(
          reading({ waterlevelStatus: 0, lastUpdate: "not a date" }),
          NOW
        )
      ).toBe(UNKNOWN_ALERT_LEVEL);
    });

    // The two non-Normal stations observed in production on 2 Sep 2026 (#73).
    it("drops T.N.B PANGSUN's Warning after 114 days without data", () => {
      expect(
        computeAlertLevel(
          reading({
            waterlevelStatus: 2,
            lastUpdate: new Date(NOW - 114 * DAY_MS).toISOString(),
          }),
          NOW
        )
      ).toBe(UNKNOWN_ALERT_LEVEL);
    });

    it("drops KG. PASIR's Alert after 58 days without data", () => {
      expect(
        computeAlertLevel(
          reading({
            waterlevelStatus: 1,
            lastUpdate: new Date(NOW - 58 * DAY_MS).toISOString(),
          }),
          NOW
        )
      ).toBe(UNKNOWN_ALERT_LEVEL);
    });
  });
});
