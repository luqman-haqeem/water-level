import type { Config, Context } from "https://edge.netlify.com/v1/mod.ts";
import { buildStationMetaHtml, isCrawler, type StationMetaInput } from "./lib/stationMeta.ts";

/**
 * Bots get a tiny HTML page with station-specific Open Graph tags (the SPA shell
 * can't carry them). Humans pass straight through to the static app — no compute.
 */
export default async (request: Request, context: Context) => {
    if (!isCrawler(request.headers.get("user-agent"))) {
        return context.next();
    }

    const stationId = context.params.id;
    const snapshotBase = (Netlify.env.get("VITE_SNAPSHOT_BASE_URL") ?? "").replace(/\/+$/, "");
    const siteUrl = Netlify.env.get("VITE_SITE_URL") ?? new URL(request.url).origin;

    let station: StationMetaInput | null = null;
    if (snapshotBase) {
        try {
            const response = await fetch(`${snapshotBase}/stations.json`);
            if (response.ok) {
                const body = (await response.json()) as { items: StationMetaInput[] };
                station = body.items.find((s) => s.id === stationId) ?? null;
            }
        } catch (error) {
            console.warn("station-meta: snapshot fetch failed", error);
        }
    }

    return new Response(buildStationMetaHtml({ siteUrl, stationId, station }), {
        headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, s-maxage=300",
        },
    });
};

export const config: Config = {
    path: "/stations/:id",
};
