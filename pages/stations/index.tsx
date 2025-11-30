
import Head from 'next/head';
import { useState, useMemo, useEffect, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTheme } from "next-themes"
import { Star, ChevronLeft, ChevronRight, Expand, RotateCw, Ellipsis, Info } from 'lucide-react'
import { WaterIcon, CameraIcon, LocationIcon } from '@/components/icons/IconLibrary'
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
import { useFilter, FilterOptions } from '../../lib/FilterContext';
import AdvancedFilter from '@/components/AdvancedFilter';
import FavoritesFilter from '@/components/FavoritesFilter';
import ExpandableSection from '@/components/ExpandableSection';
import usePullToRefresh from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import { useLocation } from '@/hooks/useLocation';
import { calculateDistance, formatDistance, Coordinates } from '@/utils/locationUtils';
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
        latitude?: number;
        longitude?: number;
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
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")
    // const [showLoginModal, setShowLoginModal] = useState(false)
    const { theme, setTheme } = useTheme()

    // Location services for nearest sorting
    const location = useLocation();


    // Fetch data from Convex with optimized caching
    const convex = useConvex();
    const stations = useQuery(api.stations.getStationsWithDetails);
    const isLoadingStations = stations === undefined;

    // Memoize stations data with deep comparison to prevent unnecessary re-renders
    const stationsData = useMemo(() => {
        if (!stations) return []

        // Sort stations by ID to ensure consistent ordering for memo comparison
        return [...stations].sort((a, b) => {
            const idA = a.id.toString()
            const idB = b.id.toString()
            return idA.localeCompare(idB)
        })
    }, [stations])
    // const { isLoggedIn, favStations, removeFavStation, addFavStation } = useUserStore();
    const isLoggedIn = false; // Commented out auth
    const favStations = useMemo(() => [] as string[], []); // Commented out favorites
    // Get filter context for favorites and advanced filters
    const { showFavoritesOnly, toggleFavorites, advancedFilters, hasActiveAdvancedFilters } = useFilter();

    const [isMobile, setIsMobile] = useState(true)

    // Calculate optimal skeleton count based on viewport
    const skeletonCount = useMemo(() => {
        if (typeof window === 'undefined') return 6 // SSR fallback

        const viewportHeight = window.innerHeight
        const cardHeight = isMobile ? 200 : 180 // Approximate card height
        const headerHeight = 200 // Approximate header space
        const visibleCards = Math.ceil((viewportHeight - headerHeight) / cardHeight)

        return Math.min(Math.max(visibleCards, 4), 12) // Between 4-12 skeletons
    }, [isMobile])

    // Pre-compute district and alert level maps for faster filtering
    const { districtMap, alertLevelMap, sortedStations } = useMemo(() => {
        const districtMap = new Map<string, typeof stationsData>()
        const alertLevelMap = new Map<string, typeof stationsData>()

        // Group stations by district and alert level for O(1) lookup
        stationsData.forEach(station => {
            // District grouping
            const district = station.districts.name
            if (!districtMap.has(district)) {
                districtMap.set(district, [])
            }
            districtMap.get(district)!.push(station)

            // Alert level grouping
            const alertLevel = station.current_levels?.alert_level || '0'
            if (!alertLevelMap.has(alertLevel)) {
                alertLevelMap.set(alertLevel, [])
            }
            alertLevelMap.get(alertLevel)!.push(station)
        })

        // Pre-sort by name for default case
        const sortedStations = [...stationsData].sort((a, b) =>
            a.station_name.localeCompare(b.station_name)
        )

        return { districtMap, alertLevelMap, sortedStations }
    }, [stationsData])

    // Optimized helper function to apply advanced filters
    const applyAdvancedFilters = useCallback((stations: typeof stationsData, filters: FilterOptions) => {
        // Start with all stations or pre-sorted list
        let filtered = filters.sortBy === 'name' && filters.sortOrder === 'asc'
            ? [...sortedStations]
            : [...stations]

        // Use pre-computed maps for efficient filtering
        if (filters.districts.length > 0) {
            const stationsInDistricts = new Set<typeof stationsData[0]>()
            filters.districts.forEach(district => {
                const stationsInDistrict = districtMap.get(district) || []
                stationsInDistrict.forEach(station => stationsInDistricts.add(station))
            })
            filtered = Array.from(stationsInDistricts)
        }

        // Use pre-computed alert level map
        if (filters.alertLevels.length > 0) {
            const stationsWithAlertLevels = new Set<typeof stationsData[0]>()
            filters.alertLevels.forEach(level => {
                const stationsAtLevel = alertLevelMap.get(level) || []
                stationsAtLevel.forEach(station => stationsWithAlertLevels.add(station))
            })

            if (filters.districts.length > 0) {
                // Intersection of district and alert level filters
                filtered = filtered.filter(station => stationsWithAlertLevels.has(station))
            } else {
                filtered = Array.from(stationsWithAlertLevels)
            }
        }

        // Apply remaining filters (these are typically smaller sets)
        if (filters.showFavoritesOnly && isLoggedIn) {
            const favSet = new Set(favStations)
            filtered = filtered.filter(station => favSet.has(station.id.toString()))
        }

        if (filters.showCameraOnly) {
            filtered = filtered.filter(station => station.cameras !== null)
        }

        if (!filters.showOfflineStations) {
            filtered = filtered.filter(station => station.station_status)
        }

        // Water level range filter (typically affects fewer items)
        if (filters.waterLevelRange.min !== null || filters.waterLevelRange.max !== null) {
            const { min, max } = filters.waterLevelRange
            filtered = filtered.filter(station => {
                const level = station.current_levels?.current_level
                if (level === undefined) return false
                return (min === null || level >= min) && (max === null || level <= max)
            })
        }

        // Sort only if not using pre-sorted data
        if (!(filters.sortBy === 'name' && filters.sortOrder === 'asc')) {
            filtered.sort((a, b) => {
                let comparison = 0

                switch (filters.sortBy) {
                    case 'name':
                        comparison = a.station_name.localeCompare(b.station_name)
                        break
                    case 'waterLevel':
                        comparison = (a.current_levels?.current_level || 0) - (b.current_levels?.current_level || 0)
                        break
                    case 'lastUpdated':
                        const aTime = new Date(a.current_levels?.updated_at || 0).getTime()
                        const bTime = new Date(b.current_levels?.updated_at || 0).getTime()
                        comparison = bTime - aTime // Most recent first by default
                        break
                    case 'district':
                        comparison = a.districts.name.localeCompare(b.districts.name)
                        break
                    case 'nearest':
                        if (!location.coordinates) {
                            // Fallback to alphabetical if location not available
                            comparison = a.station_name.localeCompare(b.station_name)
                        } else {
                            // Calculate distances for both stations
                            const userCoords = location.coordinates

                            const distanceA = a.latitude && a.longitude ?
                                calculateDistance(userCoords, { latitude: a.latitude, longitude: a.longitude }) :
                                Infinity
                            const distanceB = b.latitude && b.longitude ?
                                calculateDistance(userCoords, { latitude: b.latitude, longitude: b.longitude }) :
                                Infinity

                            comparison = distanceA - distanceB
                        }
                        break
                }

                return filters.sortOrder === 'desc' ? -comparison : comparison
            })
        }

        return filtered
    }, [isLoggedIn, favStations, sortedStations, districtMap, alertLevelMap, location.coordinates])

    // Use the advanced filters from context to apply filtering
    const displayedStations = useMemo(() => {
        // if (!hasActiveAdvancedFilters) {
        //     return stationsData;
        // }

        // Apply advanced filters
        return applyAdvancedFilters(stationsData, advancedFilters);
    }, [stationsData, advancedFilters, applyAdvancedFilters]);

    // Debounce search term for better performance
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm)
        }, 300) // 300ms debounce

        return () => clearTimeout(timer)
    }, [searchTerm])

    // Request location when 'nearest' sort is selected
    useEffect(() => {
        if (advancedFilters.sortBy === 'nearest' && !location.coordinates && !location.isLoading) {
            location.requestLocation();
        }
    }, [advancedFilters.sortBy, location]);

    // Debug location changes
    useEffect(() => {
        // Location state changes - no debug needed
    }, [location.coordinates, location.error]);    useEffect(() => {
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


    // Optimized pull-to-refresh functionality
    const pullToRefresh = usePullToRefresh({
        onRefresh: async () => {
            try {
                // Only invalidate if data is stale or user explicitly requests refresh
                // This prevents unnecessary re-fetching on navigation back
                const lastRefresh = performance.now()

                // Convex handles caching automatically, just trigger a refetch
                await convex.query(api.stations.getStationsWithDetails);

                // Small delay for smooth UX only if refresh was quick
                const refreshTime = performance.now() - lastRefresh
                if (refreshTime < 100) {
                    await new Promise(resolve => setTimeout(resolve, 200))
                }
            } catch (error) {
                console.error('Failed to refresh data:', error)
            }
        },
        threshold: 80
    })

    // Apply filtering logic with optimized search
    const filteredStations = useMemo(() => {
        // Start with advanced filtered stations or all stations
        let stations = displayedStations;

        // Optimized search term filter using debounced search
        if (debouncedSearchTerm.trim()) {
            const searchLower = debouncedSearchTerm.toLowerCase()
            stations = stations.filter(station => {
                // Cache the lowercase versions to avoid repeated toLowerCase calls
                const stationNameLower = station.station_name.toLowerCase()
                const districtNameLower = station.districts.name.toLowerCase()
                return stationNameLower.includes(searchLower) || districtNameLower.includes(searchLower)
            })
        }

        // Apply favorites filter if enabled (using Set for O(1) lookup)
        if (showFavoritesOnly && isLoggedIn) {
            const favSet = new Set(favStations)
            stations = stations.filter(station => favSet.has(station.id.toString()))
        }

        return stations;
    }, [displayedStations, debouncedSearchTerm, showFavoritesOnly, isLoggedIn, favStations]);


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

    // Optimized station click handler with preloading
    const handleStationClick = useCallback(async (station: ComponentProps['stations'][0]) => {
        try {
            // Preload station data before navigation for faster page load
            if (typeof station.id === 'object' && '_id' in station.id) {
                // Prefetch station detail data in background
                convex.query(api.stations.getStationDetailById, { stationId: station.id as Id<"stations"> })
                    .catch((err) => { console.error('Prefetch station detail error:', err); })
            }

            // Navigate immediately, don't wait for prefetch
            router.push(`/stations/${station.id.toString()}`)
        } catch (error) {
            console.error('Navigation error:', error)
            // Fallback navigation without prefetch
            router.push(`/stations/${station.id.toString()}`)
        }
    }, [router, convex])

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
                                onFilterChange={() => { }} // No-op since filtering is handled by context
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

                    {/* Location Status Indicator for Nearest Sorting */}
                    {advancedFilters.sortBy === 'nearest' && (
                        <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <LocationIcon size="sm" />
                                    <span className="text-sm font-medium">
                                        {location.isLoading ? (
                                            'Getting your location...'
                                        ) : location.coordinates ? (
                                            'Sorting by distance from your location'
                                        ) : location.error ? (
                                            'Unable to get location'
                                        ) : (
                                            'Location permission needed'
                                        )}
                                    </span>
                                </div>
                                {!location.coordinates && !location.isLoading && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            haptics.tap();
                                            location.requestLocation();
                                        }}
                                        className="text-xs"
                                    >
                                        {location.error ? 'Retry' : 'Allow Location'}
                                    </Button>
                                )}
                            </div>
                            {location.error && (
                                <p className="text-xs text-muted-foreground mt-2">
                                    {location.error}. Showing alphabetical order as fallback.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Station Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                        {isLoadingStations ? (
                            // Optimized skeleton loading states based on viewport
                            Array.from({ length: skeletonCount }).map((_, index) => (
                                <StationSkeleton key={`skeleton-${index}`} />
                            ))
                        ) : filteredStations.length > 0 ? (
                            filteredStations.map((station) => {
                                // Calculate distance for display if location is available and we're sorting by nearest
                                const distance = (advancedFilters.sortBy === 'nearest' && location.coordinates && station.latitude && station.longitude)
                                    ? calculateDistance(location.coordinates, { latitude: station.latitude, longitude: station.longitude })
                                    : undefined;

                                return (
                                    <StationCard
                                        key={station.id}
                                        station={station}
                                        isSelected={false}
                                        isFavorite={favStations.includes(station.id.toString())}
                                        showGauge={false}
                                        distance={distance}
                                        onSelect={(station) => handleStationClick(station)}
                                        onToggleFavorite={(id) => toggleFavorite('station', id)}
                                    />
                                );
                            })
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