import { defaultExclude, defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./src/test/setup.ts"],
        // Keep vitest's defaults and skip nested git worktrees under .claude/.
        exclude: [...defaultExclude, "**/.claude/**"],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
