import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "VITE_");
    const snapshotBase = (env.VITE_SNAPSHOT_BASE_URL ?? "").replace(/\/+$/, "");
    // Workbox serialises runtimeCaching into the SW file, so patterns must be
    // literal RegExps (a closure over `snapshotBase` would not survive).
    const snapshotJsonPattern = snapshotBase
        ? new RegExp(`^${escapeRegExp(snapshotBase)}/[a-z]+\\.json$`, "i")
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
                        {
                            // Cache Convex API responses with network-first
                            // This ensures latest data is shown when online,
                            // but cached data is available when offline
                            urlPattern: /^https:\/\/.*\.convex\.cloud\/.*/i,
                            handler: "NetworkFirst",
                            options: {
                                cacheName: "convex-api-cache",
                                expiration: {
                                    maxEntries: 100,
                                    maxAgeSeconds: 60 * 30, // 30 minutes
                                },
                                cacheableResponse: {
                                    statuses: [0, 200],
                                },
                                networkTimeoutSeconds: 10,
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
