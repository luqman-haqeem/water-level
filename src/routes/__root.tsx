import { Outlet } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "@/lib/queryClient";
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
            <QueryClientProvider client={queryClient}>
                <ThemeProvider>
                    <Layout>
                        <Outlet />
                    </Layout>
                </ThemeProvider>
                <ReactQueryDevtools initialIsOpen={false} />
            </QueryClientProvider>
        </PostHogProvider>
    );
}
