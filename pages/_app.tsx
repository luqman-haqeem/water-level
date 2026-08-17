import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ThemeProvider } from "next-themes";
import Layout from "@/components/layout";
import { useEffect } from "react";
import Head from "next/head";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "@/lib/queryClient";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

export default function App({ Component, pageProps }: AppProps) {
    useEffect(() => {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("/sw.js")
                .then((reg) => console.log("Service Worker registered"))
                .catch((err) =>
                    console.error("Service Worker registration failed", err)
                );
        }
    }, []);

    useEffect(() => {
        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
            api_host:
                process.env.NEXT_PUBLIC_POSTHOG_HOST ||
                "https://us.i.posthog.com",
            person_profiles: "identified_only",
            loaded: (posthog) => {
                if (process.env.NODE_ENV === "development") posthog.debug();
            },
        });
    }, []);

    return (
        <PostHogProvider client={posthog}>
            <Head>
                <title>River Water Level</title>
            </Head>
            <QueryClientProvider client={queryClient}>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                >
                    <Layout>
                        <Component {...pageProps} />
                    </Layout>
                </ThemeProvider>
                <ReactQueryDevtools initialIsOpen={false} />
            </QueryClientProvider>
        </PostHogProvider>
    );
}
