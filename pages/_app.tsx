import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ThemeProvider } from 'next-themes'
import Layout from "@/components/layout";
import { SpeedInsights } from '@vercel/speed-insights/next';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { initializeOneSignal } from '../utils/oneSignalConfig';

export default function App({ Component, pageProps }: AppProps) {

    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                initializeOneSignal();
                console.log('OneSignal initialized successfully');
            } catch (error) {
                console.error('Failed to initialize OneSignal:', error);
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
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>

                <Layout>
                    <Component {...pageProps} />
                </Layout>
                <SpeedInsights />
            </ThemeProvider>
        </>


    )
}
