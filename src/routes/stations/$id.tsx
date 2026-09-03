import { useState, useMemo } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Expand, BellOff, X } from "lucide-react";
import { BellIcon, BellRingIcon } from "@/components/icons/IconLibrary";
import useSwipeGestures from "@/hooks/useSwipeGestures";
import AlertLevelBadge from "@/components/AlertLevelBadge";
import WaterLevelGauge from "@/components/WaterLevelGauge";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Badge } from "@/components/ui/badge";
import formatTimestamp, { isStale } from "@/utils/timeUtils";
import FullscreenModal from "@/components/FullscreenModal";
import { useStationDetail } from "@/hooks/useStationDetail";
import { useStations } from "@/hooks/useStations";
import { useFilter } from "@/lib/FilterContext";
import MiniTrendChart from "@/components/MiniTrendChart";
import { useEffect } from "react";
import { useStationSubscription } from "@/hooks/useStationSubscription";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import NotificationPermissionDialog from "@/components/NotificationPermissionDialog";
import { cameraImageUrl } from "@/lib/cameraImageUrl";
import { snapshotBaseUrl } from "@/lib/snapshotEnv";

export function StationDetailRoute() {
    const navigate = useNavigate();
    const { id: stationId } = useParams({ strict: false });

    // Fetch ONLY this station's details (optimized: 4 DB lookups instead of all stations)
    const { data: currentStation, isLoading: isLoadingStation } = useStationDetail(stationId);

    // Fetch full station list only for prev/next navigation (cached from list page visit)
    const { data: stations } = useStations();
    const { advancedFilters } = useFilter();
    const stationsData = useMemo(() => {
        if (!stations) return [];
        let list = [...stations];
        // Apply the same offline filter the list page uses
        if (!advancedFilters.showOfflineStations) {
            list = list.filter((s) => s.station_status);
        }
        // Apply district filter
        if (advancedFilters.districts.length > 0) {
            list = list.filter((s) => advancedFilters.districts.includes(s.districts.name));
        }
        // Apply alert level filter
        if (advancedFilters.alertLevels.length > 0) {
            list = list.filter((s) => advancedFilters.alertLevels.includes(s.current_levels?.alert_level || '0'));
        }
        // Apply camera filter
        if (advancedFilters.showCameraOnly) {
            list = list.filter((s) => s.cameras !== null);
        }
        // Apply water level range filter
        if (advancedFilters.waterLevelRange.min !== null || advancedFilters.waterLevelRange.max !== null) {
            const { min, max } = advancedFilters.waterLevelRange;
            list = list.filter((s) => {
                const level = s.current_levels?.current_level;
                if (level === undefined) return false;
                return (min === null || level >= min) && (max === null || level <= max);
            });
        }
        return list;
    }, [stations, advancedFilters]);

    const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
    const [fullscreenImageSrc, setFullscreenImageSrc] = useState("");
    const [showPermDialog, setShowPermDialog] = useState(false);
    const [showDetailHint, setShowDetailHint] = useState(
        () => localStorage.getItem("hint-detail-dismissed") !== "true"
    );

    const dismissDetailHint = () => {
        localStorage.setItem("hint-detail-dismissed", "true");
        setShowDetailHint(false);
    };

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

    const stale = currentStation ? isStale(currentStation.current_levels?.updated_at) : false;
    const alertLevel = currentStation?.current_levels
        ? Number(currentStation.current_levels.alert_level)
        : -1;

    const doSubscribe = async () => {
        const result = await subscribe();
        if (result.permissionGranted) {
            if (alertLevel === 3 && !stale) {
                toast({
                    title: `\u26A0\uFE0F ${currentStation?.station_name} is currently at Danger level`,
                    description: `Current level: ${currentStation?.current_levels?.current_level ?? 'unknown'}m`,
                });
            } else {
                toast({
                    title: `\uD83D\uDD14 Subscribed to ${currentStation?.station_name}`,
                    description: "You'll receive alerts when this station reaches danger level",
                });
            }
        } else {
            toast({
                title: "Notifications blocked",
                description: "Notifications blocked \u2014 enable in browser settings",
            });
        }
    };

    const handleSubscribeClick = () => {
        if (isSubscribed) {
            unsubscribe().catch(() => {
                // silently handle background unsubscribe failure
            });
            toast({
                title: `\uD83D\uDD15 Unsubscribed from ${currentStation?.station_name}`,
                description: "You'll no longer receive alerts for this station",
            });
        } else {
            // Read permission at click time for accurate functional check
            const permissionState = typeof Notification !== 'undefined' ? Notification.permission : 'default';
            if (permissionState === 'denied') {
                toast({
                    title: "Notifications blocked",
                    description: "Notifications blocked \u2014 enable in browser settings",
                });
                return;
            }
            if (permissionState === 'default') {
                setShowPermDialog(true);
                return;
            }
            // Permission already granted
            doSubscribe();
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

    // Severity colour for the hero number
    const getHeroLevelColor = () => {
        if (stale || alertLevel < 0) return 'text-muted-foreground';
        switch (alertLevel) {
            case 1: return 'text-alert';
            case 2: return 'text-warning';
            case 3: return 'text-danger';
            default: return '';  // inherit default foreground
        }
    };

    // Plain-language delta to next threshold
    const getThresholdDelta = () => {
        if (!currentStation.current_levels) return null;
        const level = currentStation.current_levels.current_level;
        const danger = currentStation.danger_water_level;
        const warning = currentStation.warning_water_level;
        const alert = currentStation.alert_water_level;
        const normal = currentStation.normal_water_level;

        if (level >= danger) return { text: 'At or above Danger level', severity: 'danger' };
        if (level >= warning) return { text: `${(danger - level).toFixed(2)}m below Danger`, severity: 'warning' };
        if (level >= alert) return { text: `${(warning - level).toFixed(2)}m below Warning`, severity: 'alert' };
        if (level >= normal) return { text: `${(alert - level).toFixed(2)}m below Alert`, severity: 'normal' };
        return { text: `${(alert - level).toFixed(2)}m below Alert`, severity: 'normal' };
    };

    const thresholdDelta = getThresholdDelta();
    const heroLevelColor = getHeroLevelColor();
    // Render-time check for visual indicator (may be slightly stale if user changes permission mid-session)
    const isDenied = typeof Notification !== 'undefined' && Notification.permission === 'denied';

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
                        ) : isDenied ? (
                            <>
                                <BellOff className="h-4 w-4 opacity-50" />
                                <span>Alerts Blocked</span>
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
                    {/* First-visit detail hint */}
                    {showDetailHint && (
                        <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-start justify-between gap-2">
                            <p className="text-sm text-muted-foreground">
                                This shows how close the river is to flooding. Tap &quot;Get Alerts&quot; to be notified when it reaches Danger level.
                            </p>
                            <button onClick={dismissDetailHint} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground flex-shrink-0">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* Station Status Badge */}
                    {!currentStation.station_status && (
                        <div className="mb-4">
                            <Badge variant="outline">Station disabled</Badge>
                        </div>
                    )}

                    {/* Staleness Banner */}
                    {stale && (
                        <div className="mb-4 rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3">
                            <p className="text-sm font-medium text-destructive">
                                Data may be delayed — last updated{" "}
                                {currentStation.current_levels?.updated_at
                                    ? new Date(currentStation.current_levels.updated_at).toLocaleString()
                                    : "unknown"}
                            </p>
                        </div>
                    )}

                    {/* 1. Hero Section — no card wrapper */}
                    <div className="mb-6 space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-muted-foreground">
                                Current Water Level
                            </p>
                            <AlertLevelBadge
                                alert_level={
                                    stale ? -1 : (currentStation.current_levels
                                        ? Number(currentStation.current_levels.alert_level)
                                        : -1)
                                }
                            />
                        </div>
                        <p className={cn("text-4xl font-bold tabular-nums", heroLevelColor)}>
                            {currentStation.current_levels?.current_level ?? "\u2014"}{" "}
                            m
                        </p>
                        {thresholdDelta && (
                            <p className={cn(
                                "text-sm",
                                thresholdDelta.severity === 'danger' && "text-danger",
                                thresholdDelta.severity === 'warning' && "text-warning",
                                thresholdDelta.severity === 'alert' && "text-alert",
                                thresholdDelta.severity === 'normal' && "text-muted-foreground"
                            )}>
                                {thresholdDelta.text}
                            </p>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                                Last updated:{" "}
                                {currentStation.current_levels?.updated_at
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

                    {/* 2. Gauge — rendered directly */}
                    {currentStation.current_levels && (
                        <div className="mb-6">
                            <WaterLevelGauge
                                currentLevel={
                                    currentStation.current_levels.current_level
                                }
                                levels={{
                                    normal: currentStation.normal_water_level,
                                    alert: currentStation.alert_water_level,
                                    warning: currentStation.warning_water_level,
                                    danger: currentStation.danger_water_level,
                                }}
                                size="md"
                                orientation="horizontal"
                                showLabels={true}
                                showCurrentValue={false}
                            />
                        </div>
                    )}

                    {/* 3. Trend Chart — rendered directly */}
                    {currentStation.current_levels && (
                        <div className="mb-6">
                            <p className="text-sm font-medium text-muted-foreground mb-3">
                                3-Hour Water Level Trend
                            </p>
                            <MiniTrendChart
                                stationId={currentStation.id.toString()}
                                currentLevel={
                                    currentStation.current_levels?.current_level || 0
                                }
                                thresholds={{
                                    normal: currentStation.normal_water_level,
                                    alert: currentStation.alert_water_level,
                                    warning: currentStation.warning_water_level,
                                    danger: currentStation.danger_water_level,
                                }}
                                height={120}
                            />
                        </div>
                    )}

                    {/* 4. Threshold Reference — vertical list */}
                    <div className="mb-6">
                        <p className="text-sm font-medium text-muted-foreground mb-2">
                            Threshold Levels
                        </p>
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 bg-normal rounded-full" />
                                <span className="text-sm text-muted-foreground w-16">Normal</span>
                                <span className="text-sm font-medium">{currentStation.normal_water_level}m</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 bg-alert rounded-full" />
                                <span className="text-sm text-muted-foreground w-16">Alert</span>
                                <span className="text-sm font-medium">{currentStation.alert_water_level}m</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 bg-warning rounded-full" />
                                <span className="text-sm text-muted-foreground w-16">Warning</span>
                                <span className="text-sm font-medium">{currentStation.warning_water_level}m</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 bg-danger rounded-full" />
                                <span className="text-sm text-muted-foreground w-16">Danger</span>
                                <span className="text-sm font-medium">{currentStation.danger_water_level}m</span>
                            </div>
                        </div>
                    </div>

                    {/* 5. Camera Feed */}
                    <Card className="mb-6">
                        <CardHeader className="p-4">
                            <CardTitle className="text-sm font-medium">
                                Camera Feed
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            {currentStation?.cameras &&
                            currentStation?.cameras?.is_enabled ? (
                                <div>
                                    <div
                                        onClick={() =>
                                            openFullscreen(
                                                cameraImageUrl(
                                                    snapshotBaseUrl(),
                                                    currentStation?.cameras?.jps_camera_id ?? "",
                                                    currentStation?.cameras?.captured_at
                                                )
                                            )
                                        }
                                        className="relative cursor-pointer"
                                    >
                                        <img
                                            key={currentStation.current_levels?.updated_at?.toString()}
                                            src={cameraImageUrl(
                                                snapshotBaseUrl(),
                                                currentStation.cameras.jps_camera_id,
                                                currentStation.cameras.captured_at
                                            )}
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
                                    {stale && (
                                        <p className="text-xs text-destructive mt-2">
                                            Sensor data may be delayed — check camera for current conditions
                                        </p>
                                    )}
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

            <NotificationPermissionDialog
                open={showPermDialog}
                onOpenChange={setShowPermDialog}
                onConfirm={doSubscribe}
            />
        </>
    );
}
