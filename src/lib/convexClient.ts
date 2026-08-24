import { ConvexReactClient } from "convex/react";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
    throw new Error(
        "VITE_CONVEX_URL is not set. " +
            "Make sure to set it in your environment variables."
    );
}

/**
 * Singleton ConvexReactClient for reactive subscriptions.
 * This replaces the old ConvexHttpClient that required manual polling.
 * Convex will automatically push data updates to connected clients.
 */
export const convex = new ConvexReactClient(convexUrl);
