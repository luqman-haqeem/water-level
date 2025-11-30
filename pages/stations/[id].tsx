import { useState, useEffect, useMemo } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Head from 'next/head';
import { Star, ChevronLeft, ChevronRight, Expand } from 'lucide-react'
import { WaterIcon } from '@/components/icons/IconLibrary'
import useSwipeGestures from '@/hooks/useSwipeGestures'
import AlertLevelBadge from "@/components/AlertLevelBadge";
import WaterLevelGauge from "@/components/WaterLevelGauge";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Badge } from "@/components/ui/badge"
import { haptics } from '@/utils/haptics'
import Image from 'next/image'
import formatTimestamp from '@/utils/timeUtils'
import FullscreenModal from '@/components/FullscreenModal';
import { useRouter } from 'next/router';
import { useQuery, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useUserStore } from '../../lib/convexStore';
import ExpandableSection from '@/components/ExpandableSection';
import MiniTrendChart from '@/components/MiniTrendChart';
import { Id } from "../../convex/_generated/dataModel";

const bucketUrl = 'https://hnqhytdyrehyflbymaej.supabase.co/storage/v1/object/public/cameras';

interface StationDetailProps {
    stationId: string;
}

export default function StationDetail() {
    const router = useRouter();
    const { id } = router.query;
    const stationId = id as string;

    // Fetch data from Convex - OPTIMIZED
    const convex = useConvex();

    // For now, revert to fetching all stations to avoid the query skip error
    // The N+1 optimization in getStationsWithDetails still provides 96% bandwidth savings
    const stations = useQuery(api.stations.getStationsWithDetails);
    const isLoadingStations = stations === undefined;

    // Memoize stationsData to prevent unnecessary re-renders
    const stationsData = useMemo(() => stations || [], [stations]);
    // const { isLoggedIn, favStations, removeFavStation, addFavStation } = useUserStore();
    const isLoggedIn = false; // Commented out auth
    const favStations: string[] = []; // Commented out favorites

    const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)
    const [fullscreenImageSrc, setFullscreenImageSrc] = useState("")

    // Find current station and its position in the list
    const currentStation = stationsData.find(s => s.id.toString() === stationId);
    const currentIndex = stationsData.findIndex(s => s.id.toString() === stationId);

    useEffect(() => {
        if (!isLoadingStations && stationsData.length > 0 && !currentStation) {
            // Station not found, redirect to stations list
            router.push('/stations');
        }
    }, [stationsData, currentStation, isLoadingStations, router]);

    // const toggleFavorite = (id: Id<"stations"> | number) => {
    //     const idString = id.toString();
    //     if (favStations.includes(idString)) {
    //         removeFavStation(idString);
    //     } else {
    //         addFavStation(idString);
    //     }
    //     haptics.tap();
    // };
    const toggleFavorite = (id: Id<"stations"> | number) => {
        // Favorites disabled - do nothing
        return;
    };

    const navigateToStation = (direction: 'next' | 'prev') => {
        let newIndex: number;
        if (direction === 'next') {
            newIndex = currentIndex + 1 >= stationsData.length ? 0 : currentIndex + 1;
        } else {
            newIndex = currentIndex - 1 < 0 ? stationsData.length - 1 : currentIndex - 1;
        }

        const newStation = stationsData[newIndex];
        if (newStation) {
            router.push(`/stations/${newStation.id.toString()}`);
        }
    };

    const openFullscreen = (src: string) => {
        setFullscreenImageSrc(src)
        setIsFullscreenOpen(true)
    }

    const closeFullscreen = () => {
        setIsFullscreenOpen(false)
        setFullscreenImageSrc("")
    }

    // Swipe gesture support for station navigation
    const swipeRef = useSwipeGestures({
        onSwipeLeft: () => navigateToStation('next'),
        onSwipeRight: () => navigateToStation('prev'),
        threshold: 80,
        restoreScrollOnUp: true
    });

    if (isLoadingStations) {
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
            <Head>
                <title>{currentStation.station_name} - River Water Level</title>
                <meta name="description" content={`Current water level: ${currentStation.current_levels?.current_level || '—'} m. Alert level: ${currentStation.current_levels?.alert_level === '0' ? 'Normal' : currentStation.current_levels?.alert_level === '1' ? 'Alert' : currentStation.current_levels?.alert_level === '2' ? 'Warning' : 'Danger'}. ${currentStation.districts.name} district.`} />

                {/* Open Graph meta tags - Using Edge Function */}
                <meta property="og:title" content={`${currentStation.station_name} - Water Level Monitor`} />
                <meta property="og:description" content={`Current water level: ${currentStation.current_levels?.current_level || '—'} m. Alert level: ${currentStation.current_levels?.alert_level === '0' ? 'Normal' : currentStation.current_levels?.alert_level === '1' ? 'Alert' : currentStation.current_levels?.alert_level === '2' ? 'Warning' : 'Danger'}. ${currentStation.districts.name} district.`} />
                <meta property="og:image" content={`${process.env.NODE_ENV === 'production' ? 'https://riverlevel.netlify.app' : 'http://localhost:3000'}/og/station/${currentStation.id}`} />
                <meta property="og:image:width" content="1200" />
                <meta property="og:image:height" content="630" />
                <meta property="og:type" content="website" />
                <meta property="og:url" content={`${process.env.NODE_ENV === 'production' ? 'https://riverlevel.netlify.app' : 'http://localhost:3000'}/stations/${currentStation.id}`} />

                {/* Twitter Card meta tags - Using Edge Function */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content={`${currentStation.station_name} - Water Level Monitor`} />
                <meta name="twitter:description" content={`Current water level: ${currentStation.current_levels?.current_level || '—'} m. Alert level: ${currentStation.current_levels?.alert_level === '0' ? 'Normal' : currentStation.current_levels?.alert_level === '1' ? 'Alert' : currentStation.current_levels?.alert_level === '2' ? 'Warning' : 'Danger'}. ${currentStation.districts.name} district.`} />
                <meta name="twitter:image" content={`${process.env.NODE_ENV === 'production' ? 'https://riverlevel.netlify.app' : 'http://localhost:3000'}/og/station/${currentStation.id}`} />
            </Head>
            <div className="flex-1 flex flex-col bg-background">
                {/* Header with back button */}
                <header className="border-b px-4 py-3 flex items-center gap-3 min-h-touch">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/stations')}
                        className="min-w-touch min-h-touch"
                    >
                        <ChevronLeft className="w-5 h-5" />
                        <span className="sr-only">Back to stations</span>
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-heading-2 truncate">{currentStation.station_name}</h1>
                        <p className="text-sm text-muted-foreground">{currentStation.districts.name}</p>
                    </div>
                    {/* <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleFavorite(currentStation.id)}
                        className="min-w-touch min-h-touch"
                    >
                        <Star className={`w-5 h-5 transition-all duration-200 ${favStations.includes(currentStation.id.toString())
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'text-gray-400 hover:text-yellow-400'
                            }`} />
                        <span className="sr-only">
                            {favStations.includes(currentStation.id.toString()) ? 'Remove from' : 'Add to'} favorites
                        </span>
                    </Button> */}
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
                                        <p className="text-sm font-medium text-muted-foreground">Current Water Level</p>
                                        <AlertLevelBadge alert_level={Number(currentStation.current_levels?.alert_level) || 0} />
                                    </div>
                                    <p className="text-water-level">{currentStation.current_levels?.current_level || '—'} m</p>
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>
                                            Last updated: {currentStation.current_levels?.updated_at
                                                ? formatTimestamp(currentStation.current_levels.updated_at.toString())
                                                : 'Unknown'}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <div className={`w-2 h-2 rounded-full ${currentStation.station_status ? 'bg-success' : 'bg-destructive'}`} />
                                            {currentStation.station_status ? 'Station Online' : 'Station Offline'}
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
                            className='mb-2'
                        >
                            <div className="space-y-4">
                                {/* 3-Hour Trend Chart */}
                                <div>
                                    <div className="mb-3">
                                        <p className="text-sm font-medium text-muted-foreground">3-Hour Water Level Trend</p>
                                    </div>
                                    <MiniTrendChart
                                        stationId={currentStation.id.toString()}
                                        currentLevel={currentStation.current_levels?.current_level || 0}
                                        thresholds={{
                                            normal: currentStation.normal_water_level,
                                            alert: currentStation.alert_water_level,
                                            warning: currentStation.warning_water_level,
                                            danger: currentStation.danger_water_level
                                        }}
                                        height={120}
                                        className="mb-4"
                                    />
                                </div>

                                {/* Detailed Level Thresholds - Ultra Compact */}
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-2">Threshold Levels</p>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 bg-success rounded-full" />
                                            <span className="text-xs text-muted-foreground">Normal</span>
                                            <span className="text-xs font-medium">{currentStation.normal_water_level}m</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 bg-alert rounded-full" />
                                            <span className="text-xs text-muted-foreground">Alert</span>
                                            <span className="text-xs font-medium">{currentStation.alert_water_level}m</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 bg-warning rounded-full" />
                                            <span className="text-xs text-muted-foreground">Warning</span>
                                            <span className="text-xs font-medium">{currentStation.warning_water_level}m</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 bg-destructive rounded-full" />
                                            <span className="text-xs text-muted-foreground">Danger</span>
                                            <span className="text-xs font-medium">{currentStation.danger_water_level}m</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Visual Gauge - Vertical */}
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-2">Current Level Gauge</p>
                                    <WaterLevelGauge
                                        currentLevel={currentStation.current_levels.current_level}
                                        levels={{
                                            normal: currentStation.normal_water_level,
                                            alert: currentStation.alert_water_level,
                                            warning: currentStation.warning_water_level,
                                            danger: currentStation.danger_water_level
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
                            <CardTitle className="text-sm font-medium">Camera Feed</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            {currentStation?.cameras && currentStation?.cameras?.is_enabled ? (
                                <div
                                    onClick={() => openFullscreen(`/api/proxy-image/${currentStation?.cameras?.jps_camera_id}`)}
                                    className="relative cursor-pointer"
                                >
                                    <Image
                                        key={currentStation.current_levels?.updated_at}
                                        src={`/api/proxy-image/${currentStation?.cameras?.jps_camera_id}`}
                                        width={500}
                                        height={300}
                                        alt="Live camera feed"
                                        className="w-full rounded-md"
                                        onError={(e) => e.currentTarget.src = '/nocctv.png'}
                                        blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAUAB4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0ykZgoyxAHqaomO5xhVkAOM7pMnPOT16dO/4UrxXDqm4OWwhyHAAIxnI9aALwIIyDkGiqaxTqA5Z92TnLZGNvp9aLKTezkFyoVfvPu55z/SgC5RRRQAUUUUAf/9k="
                                        placeholder="blur"
                                        unoptimized
                                    />
                                    <div className="absolute top-0 right-0 m-2">
                                        <Expand className="h-6 w-6 text-white bg-black bg-opacity-50 rounded-full p-1" />
                                    </div>
                                </div>
                            ) : (
                                <p className="text-center text-muted-foreground">No camera feed available.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Mobile Navigation Footer */}
                <footer className="border-t bg-background/95 backdrop-blur p-4 flex justify-between items-center md:hidden">
                    <Button
                        variant="outline"
                        onClick={() => navigateToStation('prev')}
                        className="min-w-touch min-h-touch px-4"
                    >
                        <ChevronLeft className="w-5 h-5 mr-1" />
                        <span>Previous</span>
                    </Button>
                    <div className="text-sm text-muted-foreground text-center px-2">
                        <div className="font-medium">Station {currentIndex + 1}</div>
                        <div className="text-xs">of {stationsData.length}</div>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => navigateToStation('next')}
                        className="min-w-touch min-h-touch px-4"
                    >
                        <span>Next</span>
                        <ChevronRight className="w-5 h-5 ml-1" />
                    </Button>
                </footer>
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
    )
}