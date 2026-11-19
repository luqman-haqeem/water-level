"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { fetchJpsJson } from "../lib/jpsClient";

/**
 * Fetches a JPS API path from the Node runtime and returns the parsed JSON.
 *
 * The sync actions run in Convex's default runtime, whose TLS stack cannot
 * connect to JPS any more (see `lib/jpsClient.ts`), so they route every JPS
 * request through here via `ctx.runAction`.
 */
export const fetchJson = internalAction({
    args: { path: v.string() },
    // Untyped JPS JSON boundary: each caller asserts its own response shape.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: async (_ctx, { path }): Promise<any> => fetchJpsJson(path),
});
