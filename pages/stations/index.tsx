
import Head from 'next/head';
import { useState, useMemo, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTheme } from "next-themes"
import { Star, ChevronLeft, ChevronRight, Expand, RotateCw, Ellipsis, Info } from 'lucide-react'
import { WaterIcon, CameraIcon } from '@/components/icons/IconLibrary'
import useSwipeGestures from '@/hooks/useSwipeGestures'
import AlertLevelBadge from "@/components/AlertLevelBadge";
import StationCard from "@/components/StationCard";
import WaterLevelGauge from "@/components/WaterLevelGauge";
import SkeletonCard, { StationSkeleton } from "@/components/SkeletonCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Badge } from "@/components/ui/badge"
import { haptics } from '@/utils/haptics'

import Image from 'next/image'
import formatTimestamp from '@/utils/timeUtils'
// import LoginModal from '@/components/LoginModel';
import FullscreenModal from '@/components/FullscreenModal';
import { useRouter } from 'next/router';
import { useQuery, useConvexAuth } from "convex/react";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useUserStore } from '../../lib/convexStore';
import { useAuthActions } from "@convex-dev/auth/react";
import { useFilter } from '../../lib/FilterContext';
import AdvancedFilter, { FilterOptions } from '@/components/AdvancedFilter';
import FavoritesFilter from '@/components/FavoritesFilter';
import ExpandableSection from '@/components/ExpandableSection';
import usePullToRefresh from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

const bucketUrl = 'https://hnqhytdyrehyflbymaej.supabase.co/storage/v1/object/public/cameras';

import { Id } from "../../convex/_generated/dataModel";

interface ComponentProps {
    stations: {
        id: Id<"stations"> | number;
        station_name: string;
        districts: {
            name: string;
        };
        current_levels: {
            current_level: number;
            updated_at: string | number | undefined;
            alert_level: string;
        } | null;
        cameras: {
            img_url: string | undefined;
            jps_camera_id: string;
            is_enabled: boolean;
        } | null;
        normal_water_level: number;
        alert_water_level: number;
        warning_water_level: number;
        danger_water_level: number;
        station_status: boolean;
    }[];
    cameras: {
        id: number;
        camera_name: string;
        img_url: string;
        jps_camera_id: string;

        districts: {
            name: string;
        };
    }[];
}

// Note: With Convex, we'll fetch data client-side using useQuery
// Static generation can be implemented later with preloadQuery if needed
export async function getStaticProps() {
    return {
        props: {
            stations: [] // Empty initial data, will be loaded by Convex
        },
        revalidate: 180 // 3 minutes
    }
}

export default function Component({ stations: initialStations }: ComponentProps) {

    const router = useRouter();
    const { stationId } = router.query;
    const [searchTerm, setSearchTerm] = useState("")
    // const [showLoginModal, setShowLoginModal] = useState(false)
    const { theme, setTheme } = useTheme()

    // Fetch data from Convex
    const convex = useConvex();
    const stations = useQuery(api.stations.getStationsWithDetails);
    const isLoadingStations = stations === undefined;
    const stationsData = useMemo(() => stations || [], [stations]);
    // const { isLoggedIn, favStations, removeFavStation, addFavStation } = useUserStore();
    const isLoggedIn = false; // Commented out auth
    const favStations = useMemo(() => [] as string[], []); // Commented out favorites
    // const { showFavoritesOnly, toggleFavorites } = useFilter();
    const showFavoritesOnly = false; // Commented out favorites filter

    const [isMobile, setIsMobile] = useState(true)

    const [currentFilters, setCurrentFilters] = useState<FilterOptions | null>(null);
    const [displayedStations, setDisplayedStations] = useState<typeof stationsData>([]);

    // Update displayed stations when data changes or no filters applied
    useEffect(() => {
        if (!currentFilters) {
            setDisplayedStations(stationsData);
        }
    }, [stationsData, currentFilters]);

    useEffect(() => {
        const checkMobile = () => {
            const isMobileDevice = window.innerWidth < 768;
            setIsMobile(isMobileDevice);
        }
        checkMobile();
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    useEffect(() => {
        if (stationId && stationsData.length > 0) {
            // Navigate to station detail page when stationId is in URL
            router.push(`/stations/${stationId}`);
        }
    }, [stationId, stationsData, router]);


    // Pull-to-refresh functionality
    const pullToRefresh = usePullToRefresh({
        onRefresh: async () => {
            try {
                // Invalidate and refetch Convex data
                await convex.query(api.stations.getStationsWithDetails);
                // Small delay for smooth UX
                await new Promise(resolve => setTimeout(resolve, 300))
            } catch (error) {
                console.error('Failed to refresh data:', error)
            }
        },
        threshold: 80
    })

    // Handle advanced filter changes
    const handleFilterChange = (filtered: typeof stationsData, filters: FilterOptions) => {
        setDisplayedStations(filtered);
        setCurrentFilters(filters);
        haptics.tap();
    }

    // Apply filtering logic with proper search term handling
    const filteredStations = useMemo(() => {
        // Start with either advanced filtered stations or all stations
        let stations = displayedStations.length > 0 || currentFilters ? displayedStations : stationsData;
        
        // Always apply search term filter if searchTerm exists
        if (searchTerm.trim()) {
            stations = stations.filter(station =>
                station.station_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                station.districts.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        // Apply favorites filter if enabled
        if (showFavoritesOnly && isLoggedIn) {
            stations = stations.filter(station => favStations.includes(station.id.toString()));
        }
        
        return stations;
    }, [displayedStations, currentFilters, stationsData, searchTerm, showFavoritesOnly, isLoggedIn, favStations]);


    // const toggleFavorite = (type: 'station', id: Id<"stations"> | number) => {
    //     if (!isLoggedIn) {
    //         setShowLoginModal(true);
    //         return;
    //     }

    //     const idString = id.toString();
    //     if (favStations.includes(idString)) {
    //         removeFavStation(idString);
    //     } else {
    //         addFavStation(idString);
    //     }
    // };
    const toggleFavorite = (type: 'station', id: Id<"stations"> | number) => {
        // Favorites disabled - do nothing
        return;
    };

    const handleStationClick = (station: ComponentProps['stations'][0]) => {
        // Navigate to detailed station view
        router.push(`/stations/${station.id.toString()}`);
    }

    const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)
    const [fullscreenImageSrc, setFullscreenImageSrc] = useState("")

    const openFullscreen = (src: string) => {
        setFullscreenImageSrc(src)
        setIsFullscreenOpen(true)
    }
    const closeFullscreen = () => {
        setIsFullscreenOpen(false)
        setFullscreenImageSrc("")
    }

    const handleFilterSelect = (filterId: string) => {
        setActiveFilter(filterId === activeFilter ? null : filterId)
    }
    const [activeFilter, setActiveFilter] = useState<string | null>(null)

    return (
        <>
            <Head>
                <title>Stations - River Water Level</title>
            </Head>
            <div className="flex-1 flex flex-col bg-background">
                <div 
                    ref={pullToRefresh.containerRef}
                    className="flex-1 p-4 sm:p-6 overflow-auto relative min-h-0"
                >
                    <PullToRefreshIndicator
                        isVisible={pullToRefresh.shouldShowIndicator}
                        isRefreshing={pullToRefresh.isRefreshing}
                        progress={pullToRefresh.refreshProgress}
                        yOffset={pullToRefresh.indicatorY}
                    />
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-heading-1">Water Level Stations</h2>
                        <div className="flex items-center gap-2">
                            <FavoritesFilter isLoggedIn={isLoggedIn} />
                            <AdvancedFilter
                                stations={stationsData as any}
                                onFilterChange={handleFilterChange as any}
                                isLoggedIn={isLoggedIn}
                                favoriteStations={favStations}
                            />
                        </div>
                    </div>
                    
                    {/* Search Bar */}
                    <div className="mb-6">
                        <Input
                            placeholder="Search stations or districts..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="min-h-touch"
                        />
                    </div>

                    {/* Station Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                        {isLoadingStations ? (
                            // Show skeleton loading states
                            Array.from({ length: 6 }).map((_, index) => (
                                <StationSkeleton key={`skeleton-${index}`} />
                            ))
                        ) : filteredStations.length > 0 ? (
                            filteredStations.map((station) => (
                                <StationCard
                                    key={station.id}
                                    station={station}
                                    isSelected={false}
                                    isFavorite={favStations.includes(station.id.toString())}
                                    showGauge={false}
                                    onSelect={(station) => handleStationClick(station)}
                                    onToggleFavorite={(id) => toggleFavorite('station', id)}
                                />
                            ))
                        ) : (
                            <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                                <p className="text-body-large text-muted-foreground mb-2">No stations found</p>
                                <p className="text-body text-muted-foreground">Try adjusting your search or filters</p>
                            </div>
                        )}
                    </div>
                    <div className="pb-20"></div>
                </div>
            </div>

            {/* Login Modal - Commented out */}
            {/* <LoginModal
                open={showLoginModal}
                onOpenChange={setShowLoginModal}
            /> */}
        </>
    )
}