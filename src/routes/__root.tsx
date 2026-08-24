import { Outlet } from "@tanstack/react-router";
import { ConvexProvider } from "convex/react";
import { convex } from "@/lib/convexClient";
import { ThemeProvider } from "@/components/theme-provider";
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
        <PostHogProvider client={posthog}>
            <ConvexProvider client={convex}>
                <ThemeProvider>
                    <Layout>
                        <Outlet />
                    </Layout>
                </ThemeProvider>
            </ConvexProvider>
        </PostHogProvider>
    );
}
