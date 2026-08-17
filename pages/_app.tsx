import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ThemeProvider } from 'next-themes'
import Layout from "@/components/layout";
import { useEffect } from 'react';
import Head from 'next/head';
import { ConvexProvider, ConvexReactClient } from "convex/react";
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function App({ Component, pageProps }: AppProps) {

    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/sw.js')
                .then((reg) => console.log('Service Worker registered'))
                .catch((err) => console.error('Service Worker registration failed', err));
        }
    }, []);
    useEffect(() => {
        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
            api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
            person_profiles: 'identified_only',
            defaults: '2025-05-24',
            loaded: (posthog) => {
                if (process.env.NODE_ENV === 'development') posthog.debug()
            }
        })
    }, [])
    return (
        <PostHogProvider client={posthog}>

            <Head>
                <title>River Water Level</title>
            </Head>
            <ConvexProvider client={convex}>
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                    <Layout>
                        <Component {...pageProps} />
                    </Layout>
                </ThemeProvider>
            </ConvexProvider>
        </PostHogProvider>
    )
}
