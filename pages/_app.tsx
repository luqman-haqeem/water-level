import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ThemeProvider } from 'next-themes'
import Layout from "@/components/layout";
import { SpeedInsights } from '@vercel/speed-insights/next';
import { useEffect } from 'react';

export default function App({ Component, pageProps }: AppProps) {
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/sw.js')
                .then((reg) => console.log('Service Worker registered'))
                .catch((err) => console.error('Service Worker registration failed', err));
        }
    }, []);
    return (
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <Layout>
                <Component {...pageProps} />
            </Layout>
            <SpeedInsights />
        </ThemeProvider>

    )
}
