import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "next-themes";
import {
    WaterIcon,
    CameraIcon,
    LightModeIcon,
    DarkModeIcon,
} from "@/components/icons/IconLibrary";
import { Toaster } from "@/components/ui/toaster";
import BottomNavigation from "@/components/BottomNavigation";
import { HighContrastToggle } from "@/components/HighContrastToggle";
import { useRouter } from "next/router";
import { FilterProvider } from "../lib/FilterContext";

export default function Layout({ children }: { children: React.ReactNode }) {
    const [activeTab, setActiveTab] = useState("stations");
    const [isMobile, setIsMobile] = useState(false);
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    const checkActiveTab = useCallback(() => {
        const currentPath = router.pathname;
        if (currentPath.includes("/stations")) {
            setActiveTab("stations");
        } else if (currentPath.includes("/cameras")) {
            setActiveTab("cameras");
        }
    }, [router.pathname]);

    useEffect(() => {
        if (theme) {
            setTheme(theme);
        }
        checkActiveTab();
    }, [theme, setTheme, checkActiveTab]);

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        if (value === "stations") {
            router.push("/stations");
        } else if (value === "cameras") {
            router.push("/cameras");
        }
    };

    if (!mounted) {
        return null;
    }

    return (
        <>
            <div className="flex flex-col h-screen bg-background">
                {/* Header */}
                <header className="border-b px-4 py-3 flex justify-between items-center min-h-touch">
                    {!isMobile && (
                        <div className="flex items-center">
                            <Tabs
                                value={activeTab}
                                onValueChange={handleTabChange}
                            >
                                <TabsList className="h-10">
                                    <TabsTrigger
                                        value="stations"
                                        className="h-10 px-3 min-w-[60px]"
                                    >
                                        <WaterIcon
                                            size="sm"
                                            className="sm:mr-2"
                                        />
                                        <span className="hidden sm:inline sm:ml-1">
                                            Stations
                                        </span>
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="cameras"
                                        className="h-10 px-3 min-w-[60px]"
                                    >
                                        <CameraIcon
                                            size="sm"
                                            className="sm:mr-2"
                                        />
                                        <span className="hidden sm:inline sm:ml-1">
                                            Cameras
                                        </span>
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                    )}
                    {isMobile && (
                        <div className="flex items-center">
                            <WaterIcon size="lg" className="text-primary mr-2" />
                            <span className="text-heading-3">
                                Water Level Monitor
                            </span>
                        </div>
                    )}
                    <div className="flex items-center gap-1">
                        <HighContrastToggle />
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                                setTheme(theme === "dark" ? "light" : "dark")
                            }
                            className="min-w-touch min-h-touch theme-transition-colors"
                        >
                            <div className="relative w-5 h-5">
                                <div
                                    className={`absolute inset-0 transform transition-all duration-300 ease-in-out ${
                                        theme === "dark"
                                            ? "rotate-0 scale-100 opacity-100"
                                            : "rotate-90 scale-0 opacity-0"
                                    }`}
                                >
                                    <LightModeIcon size="md" />
                                </div>
                                <div
                                    className={`absolute inset-0 transform transition-all duration-300 ease-in-out ${
                                        theme === "dark"
                                            ? "-rotate-90 scale-0 opacity-0"
                                            : "rotate-0 scale-100 opacity-100"
                                    }`}
                                >
                                    <DarkModeIcon size="md" />
                                </div>
                            </div>
                            <span className="sr-only">Toggle theme</span>
                        </Button>
                    </div>
                </header>

                {/* Content */}
                <main
                    className={`flex-1 flex overflow-hidden ${isMobile ? "pb-20" : "pb-safe-bottom"}`}
                >
                    <FilterProvider>{children}</FilterProvider>
                </main>

                {/* Mobile Bottom Navigation */}
                {isMobile && (
                    <BottomNavigation
                        activeTab={activeTab}
                        onTabChange={handleTabChange}
                    />
                )}

                <Toaster />
            </div>
        </>
    );
}
