import { Outlet } from "@tanstack/react-router";
import { ConvexProvider } from "convex/react";
import { convex } from "@/lib/convexClient";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";
import Layout from "@/components/layout";
import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

export function RootLayout() {
    useEffect(() => {
        posthog.init(import.meta.env.VITE_POSTHOG_KEY || "", {
            api_host:
                import.meta.env.VITE_POSTHOG_HOST ||
                "https://us.i.posthog.com",
            person_profiles: "identified_only",
            loaded: (posthog) => {
                if (import.meta.env.DEV) posthog.debug();
            },
        });
    }, []);

    return (
        <ErrorBoundary>
            <PostHogProvider client={posthog}>
                <ConvexProvider client={convex}>
                    <ThemeProvider>
                        <OfflineBanner />
                        <Layout>
                            <ErrorBoundary>
                                <Outlet />
                            </ErrorBoundary>
                        </Layout>
                    </ThemeProvider>
                </ConvexProvider>
            </PostHogProvider>
        </ErrorBoundary>
    );
}
