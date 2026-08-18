import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: [
                "favicon.ico",
                "icon-192x192.png",
                "icon-512x512.png",
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
                        src: "/icon-192x192.png",
                        sizes: "192x192",
                        type: "image/png",
                    },
                    {
                        src: "/icon-512x512.png",
                        sizes: "512x512",
                        type: "image/png",
                    },
                ],
                orientation: "portrait",
                scope: "/",
            },
            workbox: {
                globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
            },
        }),
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
