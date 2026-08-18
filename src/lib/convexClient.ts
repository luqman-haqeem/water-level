import { ConvexHttpClient } from "convex/browser";

let _client: ConvexHttpClient | null = null;

/**
 * Returns a singleton ConvexHttpClient instance.
 * Lazily initialized to avoid errors during build
 * when VITE_CONVEX_URL may not be set.
 */
export function getConvexClient(): ConvexHttpClient {
    if (!_client) {
        const convexUrl = import.meta.env.VITE_CONVEX_URL;
        if (!convexUrl) {
            throw new Error(
                "VITE_CONVEX_URL is not set. " +
                    "Make sure to set it in your environment variables."
            );
        }
        _client = new ConvexHttpClient(convexUrl);
    }
    return _client;
}
