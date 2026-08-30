import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "VITE_");
    const snapshotBase = (env.VITE_SNAPSHOT_BASE_URL ?? "").replace(/\/+$/, "");
    // Without it the app has no data source at all, so fail loudly at build
    // time rather than shipping a bundle that fetches "/stations.json".
    if (mode === "production" && !snapshotBase) {
        throw new Error("VITE_SNAPSHOT_BASE_URL must be set for production builds (Netlify env).");
    }
    // Workbox serialises runtimeCaching into the SW file, so patterns must be
    // literal RegExps (a closure over `snapshotBase` would not survive).
    // meta.json is deliberately excluded: the snapshot store keeps its own
    // localStorage copy and must see real fetch errors (and real attemptedAt
    // values) rather than a service-worker cache hit that looks fresh.
    const snapshotJsonPattern = snapshotBase
        ? new RegExp(`^${escapeRegExp(snapshotBase)}/(stations|cameras|trends)\\.json$`, "i")
        : /$^/;
    const cameraImagePattern = snapshotBase
        ? new RegExp(`^${escapeRegExp(snapshotBase)}/cam/.+\\.jpg`, "i")
        : /$^/;

    return {
        plugins: [
            react(),
            VitePWA({
                registerType: "autoUpdate",
                includeAssets: [
                    "favicon.ico",
                    "android-chrome-192x192.png",
                    "android-chrome-512x512.png",
                    "nocctv.png",
                ],
                manifest: {
                    name: "River Water Level",
                    short_name: "RWL",
                    description:
                        "A tool to view the current water level in rivers in Selangor",
                    lang: "en-US",
                    start_url: "/stations",
                    display: "standalone",
                    background_color: "#ffffff",
                    theme_color: "#317EFB",
                    icons: [
                        {
                            src: "/android-chrome-192x192.png",
                            sizes: "192x192",
                            type: "image/png",
                        },
                        {
                            src: "/android-chrome-512x512.png",
                            sizes: "512x512",
                            type: "image/png",
                        },
                    ],
                    orientation: "portrait",
                    scope: "/",
                },
                workbox: {
                    // Cache the app shell (JS, CSS, HTML, images) with cache-first strategy
                    globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],

                    // Runtime caching for dynamic resources
                    runtimeCaching: [
                        {
                            // Cache Google Fonts stylesheets
                            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                            handler: "CacheFirst",
                            options: {
                                cacheName: "google-fonts-cache",
                                expiration: {
                                    maxEntries: 10,
                                    maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                                },
                                cacheableResponse: {
                                    statuses: [0, 200],
                                },
                            },
                        },
                        {
                            // Snapshot JSON from R2/Cloudflare: latest when online,
                            // last copy when the CDN is unreachable (fallback-site property)
                            urlPattern: snapshotJsonPattern,
                            handler: "NetworkFirst",
                            options: {
                                cacheName: "snapshot-json",
                                networkTimeoutSeconds: 8,
                                expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 },
                                cacheableResponse: { statuses: [0, 200] },
                            },
                        },
                        {
                            // Mirrored CCTV frames: show cached instantly, refresh in background
                            urlPattern: cameraImagePattern,
                            handler: "StaleWhileRevalidate",
                            options: {
                                cacheName: "camera-images",
                                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 },
                                cacheableResponse: { statuses: [0, 200] },
                            },
                        },
                    ],
                },
            }),
        ],
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./src"),
            },
        },
    };
});
