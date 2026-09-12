import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";

// Runs the Worker suite inside workerd via Miniflare, with real R2 and KV bindings
// (local, simulated — no Cloudflare account and no network). Storage is isolated per
// test file, so tests cannot leak objects into each other.
export default defineConfig({
    plugins: [
        cloudflareTest({
            wrangler: { configPath: "./wrangler.toml" },
        }),
    ],
    test: {
        name: "workers",
        include: ["src/**/*.test.ts"],
    },
});
