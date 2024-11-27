
import type { Metadata } from "next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Camera, Droplets, LogIn, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./globals.css";
import Link from "next/link"
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
    title: 'Home',
    description: 'Welcome to Next.js',
}


export default function RootLayout({
    // Layouts must accept a children prop.
    // This will be populated with nested layouts or pages
    children,
}: {
    children: React.ReactNode
}) {


    return (
        <html lang="en">
            <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
            <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
            <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
            <link rel="manifest" href="/site.webmanifest" />
            <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5" />
            <meta name="msapplication-TileColor" content="#b91d47" />
            <meta name="theme-color" content="#000000"></meta>
            <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

            <body>
                <div className="flex flex-col h-screen bg-background">
                    <NavBar />
                    {children}
                </div>
            </body>


        </html>
    )
}