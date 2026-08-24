import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationIcon } from "@/components/icons/IconLibrary";
import StationCard from "@/components/StationCard";
import { StationSkeleton } from "@/components/SkeletonCard";
import { haptics } from "@/utils/haptics";
import { useStations } from "@/hooks/useStations";
import { useFilter, FilterOptions } from "@/lib/FilterContext";
import AdvancedFilter from "@/components/AdvancedFilter";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";
import { useLocation } from "@/hooks/useLocation";
import { calculateDistance } from "@/utils/locationUtils";
import { Id } from "../../../convex/_generated/dataModel";

interface StationData {
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
}

export function StationsRoute() {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

    // Location services for nearest sorting
    const location = useLocation();

    // Fetch data with Convex reactive subscriptions (auto-updates in real-time)
    const { data: stations, isLoading: isLoadingStations } = useStations();

    // Memoize stations data
    const stationsData = useMemo(() => {
        if (!stations) return [] as StationData[];
        return [...stations].sort((a, b) => {
            const idA = a.id.toString();
            const idB = b.id.toString();
            return idA.localeCompare(idB);
        }) as StationData[];
    }, [stations]);

    // Get filter context
    const { advancedFilters } = useFilter();

    const [isMobile, setIsMobile] = useState(true);

    // Calculate optimal skeleton count based on viewport
    const skeletonCount = useMemo(() => {
        if (typeof window === "undefined") return 6;
        const viewportHeight = window.innerHeight;
        const cardHeight = isMobile ? 200 : 180;
        const headerHeight = 200;
        const visibleCards = Math.ceil(
            (viewportHeight - headerHeight) / cardHeight
        );
        return Math.min(Math.max(visibleCards, 4), 12);
    }, [isMobile]);

    // Pre-compute district and alert level maps for faster filtering
    const { districtMap, alertLevelMap, sortedStations } = useMemo(() => {
        const districtMap = new Map<string, StationData[]>();
        const alertLevelMap = new Map<string, StationData[]>();

        stationsData.forEach((station) => {
            const district = station.districts.name;
            if (!districtMap.has(district)) {
                districtMap.set(district, []);
            }
            districtMap.get(district)!.push(station);

            const alertLevel = station.current_levels?.alert_level || "0";
            if (!alertLevelMap.has(alertLevel)) {
                alertLevelMap.set(alertLevel, []);
            }
            alertLevelMap.get(alertLevel)!.push(station);
        });

        const sortedStations = [...stationsData].sort((a, b) =>
            a.station_name.localeCompare(b.station_name)
        );

        return { districtMap, alertLevelMap, sortedStations };
    }, [stationsData]);

    // Apply advanced filters
    const applyAdvancedFilters = useCallback(
        (stations: StationData[], filters: FilterOptions) => {
            let filtered =
                filters.sortBy === "name" && filters.sortOrder === "asc"
                    ? [...sortedStations]
                    : [...stations];

            if (filters.districts.length > 0) {
                const stationsInDistricts = new Set<StationData>();
                filters.districts.forEach((district) => {
                    const stationsInDistrict =
                        districtMap.get(district) || [];
                    stationsInDistrict.forEach((station) =>
                        stationsInDistricts.add(station)
                    );
                });
                filtered = Array.from(stationsInDistricts);
            }

            if (filters.alertLevels.length > 0) {
                const stationsWithAlertLevels = new Set<StationData>();
                filters.alertLevels.forEach((level) => {
                    const stationsAtLevel = alertLevelMap.get(level) || [];
                    stationsAtLevel.forEach((station) =>
                        stationsWithAlertLevels.add(station)
                    );
                });

                if (filters.districts.length > 0) {
                    filtered = filtered.filter((station) =>
                        stationsWithAlertLevels.has(station)
                    );
                } else {
                    filtered = Array.from(stationsWithAlertLevels);
                }
            }

            if (filters.showCameraOnly) {
                filtered = filtered.filter(
                    (station) => station.cameras !== null
                );
            }

            if (!filters.showOfflineStations) {
                filtered = filtered.filter(
                    (station) => station.station_status
                );
            }

            if (
                filters.waterLevelRange.min !== null ||
                filters.waterLevelRange.max !== null
            ) {
                const { min, max } = filters.waterLevelRange;
                filtered = filtered.filter((station) => {
                    const level = station.current_levels?.current_level;
                    if (level === undefined) return false;
                    return (
                        (min === null || level >= min) &&
                        (max === null || level <= max)
                    );
                });
            }

            if (
                !(filters.sortBy === "name" && filters.sortOrder === "asc")
            ) {
                filtered.sort((a, b) => {
                    let comparison = 0;

                    switch (filters.sortBy) {
                        case "name":
                            comparison = a.station_name.localeCompare(
                                b.station_name
                            );
                            break;
                        case "waterLevel":
                            comparison =
                                (a.current_levels?.current_level || 0) -
                                (b.current_levels?.current_level || 0);
                            break;
                        case "lastUpdated": {
                            const aTime = new Date(
                                a.current_levels?.updated_at || 0
                            ).getTime();
                            const bTime = new Date(
                                b.current_levels?.updated_at || 0
                            ).getTime();
                            comparison = bTime - aTime;
                            break;
                        }
                        case "district":
                            comparison = a.districts.name.localeCompare(
                                b.districts.name
                            );
                            break;
                        case "nearest":
                            if (!location.coordinates) {
                                comparison =
                                    a.station_name.localeCompare(
                                        b.station_name
                                    );
                            } else {
                                const userCoords = location.coordinates;
                                const distanceA =
                                    a.latitude && a.longitude
                                        ? calculateDistance(userCoords, {
                                              latitude: a.latitude,
                                              longitude: a.longitude,
                                          })
                                        : Infinity;
                                const distanceB =
                                    b.latitude && b.longitude
                                        ? calculateDistance(userCoords, {
                                              latitude: b.latitude,
                                              longitude: b.longitude,
                                          })
                                        : Infinity;
                                comparison = distanceA - distanceB;
                            }
                            break;
                    }

                    return filters.sortOrder === "desc"
                        ? -comparison
                        : comparison;
                });
            }

            return filtered;
        },
        [sortedStations, districtMap, alertLevelMap, location.coordinates]
    );

    const displayedStations = useMemo(() => {
        return applyAdvancedFilters(stationsData, advancedFilters);
    }, [stationsData, advancedFilters, applyAdvancedFilters]);

    // Debounce search term
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Request location when 'nearest' sort is selected
    useEffect(() => {
        if (
            advancedFilters.sortBy === "nearest" &&
            !location.coordinates &&
            !location.isLoading
        ) {
            location.requestLocation();
        }
    }, [advancedFilters.sortBy, location]);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Pull-to-refresh (visual feedback only — Convex auto-updates data in real-time)
    const pullToRefresh = usePullToRefresh({
        onRefresh: async () => {
            // Data is already live via Convex subscriptions.
            // Brief delay for visual feedback that "something happened"
            await new Promise((resolve) => setTimeout(resolve, 300));
        },
        threshold: 80,
    });

    // Apply search filter
    const filteredStations = useMemo(() => {
        let result = displayedStations;

        if (debouncedSearchTerm.trim()) {
            const searchLower = debouncedSearchTerm.toLowerCase();
            result = result.filter((station) => {
                const stationNameLower =
                    station.station_name.toLowerCase();
                const districtNameLower =
                    station.districts.name.toLowerCase();
                return (
                    stationNameLower.includes(searchLower) ||
                    districtNameLower.includes(searchLower)
                );
            });
        }

        return result;
    }, [displayedStations, debouncedSearchTerm]);

    // Station click handler
    const handleStationClick = useCallback(
        async (station: StationData) => {
            navigate({ to: "/stations/$id", params: { id: station.id.toString() } });
        },
        [navigate]
    );

    return (
        <>
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
                        <h2 className="text-heading-1">
                            Water Level Stations
                        </h2>
                        <div className="flex items-center gap-2">
                            <AdvancedFilter
                                stations={stationsData}
                                onFilterChange={() => {}}
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
                    {advancedFilters.sortBy === "nearest" && (
                        <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <LocationIcon size="sm" />
                                    <span className="text-sm font-medium">
                                        {location.isLoading ? (
                                            "Getting your location..."
                                        ) : location.coordinates ? (
                                            "Sorting by distance from your location"
                                        ) : location.error ? (
                                            "Unable to get location"
                                        ) : (
                                            "Location permission needed"
                                        )}
                                    </span>
                                </div>
                                {!location.coordinates &&
                                    !location.isLoading && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                haptics.tap();
                                                location.requestLocation();
                                            }}
                                            className="text-xs"
                                        >
                                            {location.error
                                                ? "Retry"
                                                : "Allow Location"}
                                        </Button>
                                    )}
                            </div>
                            {location.error && (
                                <p className="text-xs text-muted-foreground mt-2">
                                    {location.error}. Showing alphabetical
                                    order as fallback.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Station Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                        {isLoadingStations ? (
                            Array.from({ length: skeletonCount }).map(
                                (_, index) => (
                                    <StationSkeleton
                                        key={`skeleton-${index}`}
                                    />
                                )
                            )
                        ) : filteredStations.length > 0 ? (
                            filteredStations.map((station) => {
                                const distance =
                                    advancedFilters.sortBy === "nearest" &&
                                    location.coordinates &&
                                    station.latitude &&
                                    station.longitude
                                        ? calculateDistance(
                                              location.coordinates,
                                              {
                                                  latitude:
                                                      station.latitude,
                                                  longitude:
                                                      station.longitude,
                                              }
                                          )
                                        : undefined;

                                return (
                                    <StationCard
                                        key={station.id.toString()}
                                        station={station}
                                        isSelected={false}
                                        showGauge={false}
                                        distance={distance}
                                        onSelect={(s) =>
                                            handleStationClick(s)
                                        }
                                    />
                                );
                            })
                        ) : (
                            <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                                <p className="text-body-large text-muted-foreground mb-2">
                                    No stations found
                                </p>
                                <p className="text-body text-muted-foreground">
                                    Try adjusting your search or filters
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="pb-20"></div>
                </div>
            </div>
        </>
    );
}
