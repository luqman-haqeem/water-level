/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_CONVEX_URL: string;
    readonly VITE_POSTHOG_KEY: string;
    readonly VITE_POSTHOG_HOST: string;
    readonly VITE_SITE_URL?: string;
    readonly VITE_SNAPSHOT_BASE_URL?: string;
    readonly VITE_DATA_SOURCE?: "snapshot" | "convex";
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
