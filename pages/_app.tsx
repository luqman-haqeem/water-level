import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ThemeProvider } from 'next-themes'
import Layout from "@/components/layout";
import { SpeedInsights } from '@vercel/speed-insights/next';
import { useEffect } from 'react';
import Head from 'next/head';
import { initializeOneSignal } from '../utils/oneSignalConfig';
import { ConvexProvider, ConvexReactClient } from "convex/react";
// import { ConvexAuthProvider } from "@convex-dev/auth/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function App({ Component, pageProps }: AppProps) {

    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                initializeOneSignal();
                console.log('OneSignal initialization attempted');
            } catch (error) {
                console.warn('OneSignal initialization failed (this is okay if not configured):', error);
            }
        }
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/sw.js')
                .then((reg) => console.log('Service Worker registered'))
                .catch((err) => console.error('Service Worker registration failed', err));
        }
    }, []);
    return (
        <>
            <Head>
                <title>River Water Level</title>
            </Head>
            {/* ConvexAuthProvider commented out - using ConvexProvider without auth */}
            <ConvexProvider client={convex}>
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                    <Layout>
                        <Component {...pageProps} />
                    </Layout>
                    <SpeedInsights />
                </ThemeProvider>
            </ConvexProvider>
        </>
    )
}
