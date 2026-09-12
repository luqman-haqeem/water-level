import { defineConfig } from "vitest/config";
import path from "path";

// Two projects: the existing app/Convex suite in jsdom, and the Worker suite which
// runs inside workerd (see workers/vitest.config.ts). `npm run test` runs both, so
// CI needs no change. The app project pins `include` explicitly — the default glob
// would otherwise sweep up workers/**, which cannot run in jsdom.
export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: "app",
                    environment: "jsdom",
                    globals: true,
                    setupFiles: ["./src/test/setup.ts"],
                    include: [
                        "src/**/*.{test,spec}.{ts,tsx}",
                        "convex/**/*.{test,spec}.{ts,tsx}",
                        "netlify/**/*.{test,spec}.{ts,tsx}",
                    ],
                },
                resolve: {
                    alias: { "@": path.resolve(__dirname, "./src") },
                },
            },
            "./workers/vitest.config.ts",
        ],
    },
});
