// Read lazily (functions, not constants): Vitest's vi.stubEnv runs after hoisted
// imports, and Vite inlines import.meta.env.* at build time either way.

export function snapshotBaseUrl(): string {
    return (import.meta.env.VITE_SNAPSHOT_BASE_URL ?? "").replace(/\/+$/, "");
}

export function dataSource(): "snapshot" | "convex" {
    return import.meta.env.VITE_DATA_SOURCE === "convex" ? "convex" : "snapshot";
}

export function requireSnapshotBaseUrl(): string {
    const base = snapshotBaseUrl();
    if (!base) {
        throw new Error("VITE_SNAPSHOT_BASE_URL is not set. Add it to .env.local / Netlify env.");
    }
    return base;
}
