import { convertJpsDateToIso } from "./jpsDate";

export interface DistrictStamp {
    districtId: number;
    allLastUpdated: string; // JPS format "DD/MM/YYYY HH:mm:ss"
}

/**
 * Stable fingerprint of "what JPS has published". Identical input across two
 * cron runs means JPS hasn't updated anything, so DB writes can be skipped.
 */
export function computeJpsFingerprint(districts: DistrictStamp[]): string {
    return [...districts]
        .sort((a, b) => a.districtId - b.districtId)
        .map((d) => `${d.districtId}:${d.allLastUpdated}`)
        .join("|");
}

/** Most recent JPS allLastUpdated across districts, as UTC ISO; null if none. */
export function latestJpsUpdate(districts: DistrictStamp[]): string | null {
    let latest: string | null = null;
    for (const d of districts) {
        if (!d.allLastUpdated) continue;
        const iso = convertJpsDateToIso(d.allLastUpdated);
        if (latest === null || iso > latest) latest = iso;
    }
    return latest;
}
