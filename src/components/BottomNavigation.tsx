import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { haptics } from "@/utils/haptics";
import { WaterIcon, CameraIcon } from "@/components/icons/IconLibrary";

interface BottomNavigationProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
}

export default function BottomNavigation({
    activeTab,
    onTabChange,
}: BottomNavigationProps) {
    const [isVisible, setIsVisible] = useState(true);
    const [lastScrollY, setLastScrollY] = useState(0);

    // Auto-hide bottom nav on scroll
    useEffect(() => {
        const controlNavbar = () => {
            if (typeof window !== "undefined") {
                const currentScrollY = window.scrollY;

                if (currentScrollY < lastScrollY || currentScrollY < 100) {
                    setIsVisible(true);
                } else if (
                    currentScrollY > lastScrollY &&
                    currentScrollY > 100
                ) {
                    setIsVisible(false);
                }

                setLastScrollY(currentScrollY);
            }
        };

        if (typeof window !== "undefined") {
            window.addEventListener("scroll", controlNavbar);
            return () => {
                window.removeEventListener("scroll", controlNavbar);
            };
        }
    }, [lastScrollY]);

    return (
        <nav
            className={cn(
                "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out theme-transition-colors",
                "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
                "border-t border-border/40",
                "pb-safe-bottom",
                isVisible ? "translate-y-0" : "translate-y-full"
            )}
        >
            <div className="flex items-center justify-around px-2 py-2">
                <Button
                    variant={activeTab === "stations" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => {
                        if (activeTab !== "stations") {
                            haptics.select();
                        }
                        onTabChange("stations");
                    }}
                    className="flex-col h-12 min-w-[60px] px-2 gap-1"
                >
                    <WaterIcon
                        size="md"
                        className={cn(
                            activeTab === "stations" &&
                                "text-primary-foreground"
                        )}
                    />
                    <span className="text-caption">Stations</span>
                </Button>

                <Button
                    variant={activeTab === "cameras" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => {
                        if (activeTab !== "cameras") {
                            haptics.select();
                        }
                        onTabChange("cameras");
                    }}
                    className="flex-col h-12 min-w-[60px] px-2 gap-1"
                >
                    <CameraIcon
                        size="md"
                        className={cn(
                            activeTab === "cameras" &&
                                "text-primary-foreground"
                        )}
                    />
                    <span className="text-caption">Cameras</span>
                </Button>
            </div>
        </nav>
    );
}
