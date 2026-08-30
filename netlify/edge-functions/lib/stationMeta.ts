// Pure helpers for the station-meta edge function. No Deno/Netlify imports so
// they run under Vitest too.

export const CRAWLER_UA =
    /facebookexternalhit|facebot|twitterbot|whatsapp|telegrambot|linkedinbot|slackbot|discordbot|googlebot|bingbot|pinterestbot|skypeuripreview|applebot/i;

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
        // No meta refresh: this document is only served to crawlers, and a
        // refresh back to the same URL risks a redirect loop for anything the
        // UA test misclassifies. The anchor is enough for a human who lands here.
        `</head><body><a href="${pageUrl}">${escapeHtml(title)}</a></body></html>`,
    ].join("\n");
}
