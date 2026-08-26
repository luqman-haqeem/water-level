import { useState, useMemo } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import { WaterIcon, BellIcon, BellRingIcon } from "@/components/icons/IconLibrary";
import useSwipeGestures from "@/hooks/useSwipeGestures";
import AlertLevelBadge from "@/components/AlertLevelBadge";
import WaterLevelGauge from "@/components/WaterLevelGauge";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Badge } from "@/components/ui/badge";
import formatTimestamp from "@/utils/timeUtils";
import FullscreenModal from "@/components/FullscreenModal";
import { useStationDetail } from "@/hooks/useStationDetail";
import { useStations } from "@/hooks/useStations";
import ExpandableSection from "@/components/ExpandableSection";
import MiniTrendChart from "@/components/MiniTrendChart";
import { useEffect } from "react";
import { useStationSubscription } from "@/hooks/useStationSubscription";
import { useToast } from "@/hooks/use-toast";

export function StationDetailRoute() {
    const navigate = useNavigate();
    const { id: stationId } = useParams({ strict: false });

    // Fetch ONLY this station's details (optimized: 4 DB lookups instead of all stations)
    const { data: currentStation, isLoading: isLoadingStation } = useStationDetail(stationId);

    // Fetch full station list only for prev/next navigation (cached from list page visit)
    const { data: stations } = useStations();
    const stationsData = useMemo(() => stations || [], [stations]);

    const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
    const [fullscreenImageSrc, setFullscreenImageSrc] = useState("");

    // Find current station's position in the list for navigation
    const currentIndex = stationsData.findIndex(
        (s) => s.id.toString() === stationId
    );

    // Update document title
    useEffect(() => {
        if (currentStation) {
            document.title = `${currentStation.station_name} - River Water Level`;
        }
        return () => {
            document.title = "River Water Level";
        };
    }, [currentStation]);

    const { isSubscribed, subscribe, unsubscribe } = useStationSubscription(
        stationId || "",
        currentStation?.station_name || "Unknown Station"
    );
    const { toast } = useToast();

    const handleSubscribeClick = () => {
        if (isSubscribed) {
            unsubscribe().catch(() => {
                // silently handle background unsubscribe failure
            });
            toast({
                title: `🔕 Unsubscribed from ${currentStation?.station_name}`,
                description: "You'll no longer receive alerts for this station",
            });
        } else {
            subscribe().catch(() => {
                // silently handle background subscribe failure
            });
            toast({
                title: `🔔 Subscribed to ${currentStation?.station_name}`,
                description: "You'll receive alerts when this station reaches danger level",
            });
        }
    };

    const navigateToStation = (direction: "next" | "prev") => {
        if (stationsData.length === 0 || currentIndex === -1) return;

        let newIndex: number;
        if (direction === "next") {
            newIndex =
                currentIndex + 1 >= stationsData.length
                    ? 0
                    : currentIndex + 1;
        } else {
            newIndex =
                currentIndex - 1 < 0
                    ? stationsData.length - 1
                    : currentIndex - 1;
        }

        const newStation = stationsData[newIndex];
        if (newStation) {
            navigate({
                to: "/stations/$id",
                params: { id: newStation.id.toString() },
            });
        }
    };

    const openFullscreen = (src: string) => {
        setFullscreenImageSrc(src);
        setIsFullscreenOpen(true);
    };

    const closeFullscreen = () => {
        setIsFullscreenOpen(false);
        setFullscreenImageSrc("");
    };

    // Swipe gesture support for station navigation
    const swipeRef = useSwipeGestures({
        onSwipeLeft: () => navigateToStation("next"),
        onSwipeRight: () => navigateToStation("prev"),
        threshold: 80,
        restoreScrollOnUp: true,
    });

    if (isLoadingStation) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!currentStation) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <p>Station not found</p>
            </div>
        );
    }

    return (
        <>
            <div className="flex-1 flex flex-col bg-background">
                {/* Header with back button */}
                <header className="border-b px-4 py-3 flex items-center gap-3 min-h-touch">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate({ to: "/stations" })}
                        className="min-w-touch min-h-touch"
                    >
                        <ChevronLeft className="w-5 h-5" />
                        <span className="sr-only">Back to stations</span>
                    </Button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-heading-2 truncate">
                            {currentStation.station_name}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {currentStation.districts.name}
                        </p>
                    </div>
                    <Button
                        variant={isSubscribed ? "default" : "outline"}
                        size="sm"
                        onClick={handleSubscribeClick}
                        className="shrink-0 gap-1.5"
                    >
                        {isSubscribed ? (
                            <>
                                <BellRingIcon size="sm" className="text-current" />
                                <span>Alerts On</span>
                            </>
                        ) : (
                            <>
                                <BellIcon size="sm" className="text-current" />
                                <span>Get Alerts</span>
                            </>
                        )}
                    </Button>
                </header>

                {/* Main Content */}
                <div
                    ref={swipeRef}
                    className="flex-1 p-4 sm:p-6 overflow-auto pb-20"
                >
                    {/* Station Status Badge */}
                    {!currentStation.station_status && (
                        <div className="mb-4">
                            <Badge variant="outline">Station disabled</Badge>
                        </div>
                    )}

                    {/* Primary Information */}
                    <div className="grid grid-cols-1 gap-4 mb-6">
                        <Card className="theme-transition-colors">
                            <CardContent className="p-4">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-medium text-muted-foreground">
                                            Current Water Level
                                        </p>
                                        <AlertLevelBadge
                                            alert_level={
                                                currentStation.current_levels
                                                    ? Number(
                                                          currentStation
                                                              .current_levels
                                                              .alert_level
                                                      )
                                                    : -1
                                            }
                                        />
                                    </div>
                                    <p className="text-water-level">
                                        {currentStation.current_levels
                                            ?.current_level ?? "\u2014"}{" "}
                                        m
                                    </p>
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>
                                            Last updated:{" "}
                                            {currentStation.current_levels
                                                ?.updated_at
                                                ? formatTimestamp(
                                                      currentStation.current_levels.updated_at.toString()
                                                  )
                                                : "Unknown"}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <div
                                                className={`w-2 h-2 rounded-full ${currentStation.station_status ? "bg-success" : "bg-destructive"}`}
                                            />
                                            {currentStation.station_status
                                                ? "Station Online"
                                                : "Station Offline"}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Water Level Details - Expandable */}
                    {currentStation.current_levels && (
                        <ExpandableSection
                            title="Water Level Details"
                            icon={<WaterIcon size="sm" />}
                            defaultExpanded={true}
                            variant="card"
                            className="mb-2"
                        >
                            <div className="space-y-4">
                                {/* 3-Hour Trend Chart */}
                                <div>
                                    <div className="mb-3">
                                        <p className="text-sm font-medium text-muted-foreground">
                                            3-Hour Water Level Trend
                                        </p>
                                    </div>
                                    <MiniTrendChart
                                        stationId={currentStation.id.toString()}
                                        currentLevel={
                                            currentStation.current_levels
                                                ?.current_level || 0
                                        }
                                        thresholds={{
                                            normal: currentStation.normal_water_level,
                                            alert: currentStation.alert_water_level,
                                            warning:
                                                currentStation.warning_water_level,
                                            danger: currentStation.danger_water_level,
                                        }}
                                        height={120}
                                        className="mb-4"
                                    />
                                </div>

                                {/* Threshold Levels */}
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-2">
                                        Threshold Levels
                                    </p>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 bg-success rounded-full" />
                                            <span className="text-xs text-muted-foreground">
                                                Normal
                                            </span>
                                            <span className="text-xs font-medium">
                                                {
                                                    currentStation.normal_water_level
                                                }
                                                m
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 bg-alert rounded-full" />
                                            <span className="text-xs text-muted-foreground">
                                                Alert
                                            </span>
                                            <span className="text-xs font-medium">
                                                {
                                                    currentStation.alert_water_level
                                                }
                                                m
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 bg-warning rounded-full" />
                                            <span className="text-xs text-muted-foreground">
                                                Warning
                                            </span>
                                            <span className="text-xs font-medium">
                                                {
                                                    currentStation.warning_water_level
                                                }
                                                m
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 bg-destructive rounded-full" />
                                            <span className="text-xs text-muted-foreground">
                                                Danger
                                            </span>
                                            <span className="text-xs font-medium">
                                                {
                                                    currentStation.danger_water_level
                                                }
                                                m
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Visual Gauge */}
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-2">
                                        Current Level Gauge
                                    </p>
                                    <WaterLevelGauge
                                        currentLevel={
                                            currentStation.current_levels
                                                .current_level
                                        }
                                        levels={{
                                            normal: currentStation.normal_water_level,
                                            alert: currentStation.alert_water_level,
                                            warning:
                                                currentStation.warning_water_level,
                                            danger: currentStation.danger_water_level,
                                        }}
                                        size="md"
                                        orientation="vertical"
                                        showLabels={true}
                                        showCurrentValue={true}
                                        className="flex justify-center"
                                    />
                                </div>
                            </div>
                        </ExpandableSection>
                    )}

                    {/* Camera Feed */}
                    <Card className="mb-6">
                        <CardHeader className="p-4">
                            <CardTitle className="text-sm font-medium">
                                Camera Feed
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            {currentStation?.cameras &&
                            currentStation?.cameras?.is_enabled ? (
                                <div
                                    onClick={() =>
                                        openFullscreen(
                                            `/api/proxy-image/${currentStation?.cameras?.jps_camera_id}`
                                        )
                                    }
                                    className="relative cursor-pointer"
                                >
                                    <img
                                        key={currentStation.current_levels?.updated_at?.toString()}
                                        src={`/api/proxy-image/${currentStation?.cameras?.jps_camera_id}`}
                                        alt="Live camera feed"
                                        className="w-full rounded-md"
                                        onError={(e) =>
                                            (e.currentTarget.src =
                                                "/nocctv.png")
                                        }
                                    />
                                    <div className="absolute top-0 right-0 m-2">
                                        <Expand className="h-6 w-6 text-white bg-black bg-opacity-50 rounded-full p-1" />
                                    </div>
                                </div>
                            ) : (
                                <p className="text-center text-muted-foreground">
                                    No camera feed available.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Mobile Navigation Footer - only shown when station list is available */}
                {stationsData.length > 0 && currentIndex !== -1 && (
                    <footer className="border-t bg-background/95 backdrop-blur p-4 flex justify-between items-center md:hidden">
                        <Button
                            variant="outline"
                            onClick={() => navigateToStation("prev")}
                            className="min-w-touch min-h-touch px-4"
                        >
                            <ChevronLeft className="w-5 h-5 mr-1" />
                            <span>Previous</span>
                        </Button>
                        <div className="text-sm text-muted-foreground text-center px-2">
                            <div className="font-medium">
                                Station {currentIndex + 1}
                            </div>
                            <div className="text-xs">
                                of {stationsData.length}
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => navigateToStation("next")}
                            className="min-w-touch min-h-touch px-4"
                        >
                            <span>Next</span>
                            <ChevronRight className="w-5 h-5 ml-1" />
                        </Button>
                    </footer>
                )}
            </div>

            <FullscreenModal
                open={isFullscreenOpen}
                onOpenChange={closeFullscreen}
                imageSrc={fullscreenImageSrc}
                cameraName={`${currentStation.station_name} Camera Feed`}
                onSwipeUp={() => closeFullscreen()}
                showControls={false}
            />
        </>
    );
}
