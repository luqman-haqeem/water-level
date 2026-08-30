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
