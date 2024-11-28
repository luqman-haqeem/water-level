"use client"
import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Expand, Info, Star } from "lucide-react"
import { Input } from "@/components/ui/input"
import FilterDropdown from "@/components/FilterDropdown"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import AlertLevelBadge from "@/components/AlertLevelBadge"
import LoginModal from "@/components/LoginModel"
import useUserStore from "@/lib/store"
import formatTimestamp from "@/utils/timeUtils"
import { Badge } from "@/components/ui/badge"
import StationDetails from "@/components/StationDetails";

type Station = {
    id: number;
    station_name: string;
    districts: {
        name: string;
    };
    current_levels: {
        current_level: number;
        updated_at: string;
        alert_level: string;
    };
    cameras: {
        img_url: string;
        jps_camera_id: string;
        is_enabled: boolean;

    };
    normal_water_level: number;
    alert_water_level: number;
    warning_water_level: number;
    danger_water_level: number;
    station_status: boolean;

}
interface ComponentProps {
    initialStations: Station[];
}
export function useMobileDetection() {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        }

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    return isMobile;
}


export default function StationsComponent({ initialStations }: ComponentProps) {
    const [stations, setStations] = useState<Station[]>(initialStations);

    const router = useRouter();
    const { isLoggedIn, user, favStations, removeFavStation, addFavStation } = useUserStore();

    const [selectedLocation, setSelectedLocation] = useState("All")
    const [selectedStation, setSelectedStation] = useState<Station | null>(null)
    const [searchTerm, setSearchTerm] = useState("")

    const [sortBy, setSortBy] = useState<"name" | "waterLevel">("name");
    const [filterByStatus, setFilterByStatus] = useState<string | null>(null);
    const [filterByFavorite, setFilterByFavorite] = useState<boolean>(false);
    const [activeFilter, setActiveFilter] = useState<string | null>(null)
    const [showLoginModal, setShowLoginModal] = useState(false)
    const isMobile = useMobileDetection();

    const [isSideMenuExpanded, setIsSideMenuExpanded] = useState(false);


    const locations = useMemo(() => {
        const uniqueLocations = new Set(stations.map(station => station.districts.name))
        return ["All", ...Array.from(uniqueLocations)]
    }, [])

    const filteredStations = useMemo(() => {
        let filtered = stations.filter(station =>
            (selectedLocation === "All" || station.districts.name === selectedLocation) &&
            (station.station_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                station.districts.name.toLowerCase().includes(searchTerm.toLowerCase()))
        );

        if (filterByStatus) {
            filtered = filtered.filter(station => {
                const match = station.current_levels?.alert_level == filterByStatus;
                return match;
            });
        }
        if (filterByFavorite) {
            filtered = filtered.filter(station => favStations.includes(station.id.toString()));
        }

        return filtered.sort((a, b) => {
            if (sortBy === "name") {
                return a.station_name.localeCompare(b.station_name);
            } else {
                return (a.current_levels?.current_level || 0) - (b.current_levels?.current_level || 0);
            }
        });
    }, [searchTerm, selectedLocation, filterByStatus, filterByFavorite, sortBy, favStations, stations]);
    const resetFilteredStations = () => {
        setFilterByFavorite(false)
        setFilterByStatus(null)
    }

    const toggleFavorite = (type: 'station', id: number) => {
        if (!isLoggedIn) {
            setShowLoginModal(true);
            return;
        }

        if (favStations.includes(id.toString())) {
            removeFavStation(id.toString());
        } else {
            addFavStation(id.toString());
        }
    };

    const handleStationChange = (stationId: string) => {
        const station = filteredStations.find(s => s.id.toString() === stationId);

        if (station) {
            // console.log(station);
            setSelectedStation(station);
            router.push(`?stationId=${station.id}`);
        }
    }

    const handlePreviousStation = () => {
        const currentIndex = filteredStations.findIndex(s => s.id === selectedStation?.id)
        if (currentIndex > 0) handleStationChange(filteredStations[currentIndex - 1].id.toString())
    }

    const handleNextStation = () => {
        const currentIndex = filteredStations.findIndex(s => s.id === selectedStation?.id)
        if (currentIndex < filteredStations.length - 1) handleStationChange(filteredStations[currentIndex + 1].id.toString())
    }


    const handleFilterSelect = (filterId: string) => {
        setActiveFilter(filterId === activeFilter ? null : filterId)
    }

    return (
        <>
            <main className="flex-1 flex overflow-hidden">
                {/* <StationList /> */}
                <div className={`border-r flex flex-col transition-all duration-300 ease-in-out ${isSideMenuExpanded ? (isMobile ? 'w-full absolute inset-0 z-10 bg-background' : 'w-full md:w-1/3') : 'w-0 md:w-16'}`}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="self-end m-2"
                        onClick={() => setIsSideMenuExpanded(!isSideMenuExpanded)}
                    >
                        {isSideMenuExpanded ? <ChevronLeft /> : <ChevronRight />}
                    </Button>
                    {isSideMenuExpanded && (
                        <div className="p-4 flex-1 flex flex-col overflow-hidden">
                            <div className="flex items-center mb-4">
                                <Input
                                    placeholder="Search stations..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="mr-2"
                                />
                                <FilterDropdown
                                    activeFilter={activeFilter}
                                    isLoggedIn={isLoggedIn}
                                    handleFilterSelect={handleFilterSelect}
                                    resetFilteredStations={resetFilteredStations}
                                    setSortBy={setSortBy}
                                    setFilterByStatus={setFilterByStatus}
                                    setFilterByFavorite={setFilterByFavorite}
                                    setActiveFilter={setActiveFilter}

                                />
                            </div>
                            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                                <SelectTrigger className="mb-4">
                                    <SelectValue placeholder="Filter by location" />
                                </SelectTrigger>
                                <SelectContent>
                                    {locations.map(location => (
                                        <SelectItem key={location} value={location}>{location}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <ScrollArea className="flex-1">
                                {filteredStations.map(station => (


                                    <Card
                                        key={station.id}
                                        className={`mb-2 cursor-pointer ${selectedStation?.id === station.id ? 'border-primary' : ''}`}

                                        onClick={() => {
                                            // setSelectedStation(station)
                                            handleStationChange(station.id.toString())
                                            if (isMobile) setIsSideMenuExpanded(false)
                                        }}
                                    >

                                        <CardHeader className="p-4">
                                            <div className="flex justify-between items-center">
                                                <CardTitle className="text-sm font-medium ">{station.station_name}
                                                    {!station.station_status ? <Badge className='ml-2' variant="outline">Station disabled</Badge> : null}

                                                </CardTitle>

                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        toggleFavorite('station', station.id)
                                                    }}
                                                >
                                                    <Star className={`h-4 w-4 ${favStations.includes(station.id.toString()) ? 'fill-yellow-400' : ''}`} />
                                                </Button>
                                            </div>
                                            <p className="text-xs text-muted-foreground">{station.districts.name}</p>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0 flex justify-between items-center">
                                            <div>

                                                <p className="text-sm font-medium">{station.current_levels?.current_level} m</p>
                                                <p className="text-xs text-muted-foreground">{formatTimestamp(station.current_levels?.updated_at)}</p>

                                            </div>
                                            {/* <Badge variant={station.status === "Normal" ? "secondary" : "destructive"}>{station.current_levels?.alert_level}</Badge> */}
                                            <AlertLevelBadge alert_level={Number(station.current_levels?.alert_level) || 0} />

                                        </CardContent>
                                    </Card>
                                ))}
                            </ScrollArea>
                        </div>
                    )}
                </div>

                {/* Filter Mobile */}
                <div className={`flex-1 p-2 md:p-4 overflow-auto ${isMobile && isSideMenuExpanded ? 'hidden' : 'block'}`}>
                    <div className="flex items-center mb-4 block md:hidden pb-4">
                        <Select value={selectedStation?.id.toString() || ''} onValueChange={handleStationChange}>
                            <SelectTrigger className="w-full md:w-[300px] lg:w-[400px] mr-2">
                                <SelectValue placeholder="Select station" />
                            </SelectTrigger>
                            <SelectContent> {filteredStations.length > 0 ? (
                                filteredStations.map(station => (
                                    <SelectItem key={station.id} value={station.id.toString()}>
                                        {station.station_name}
                                    </SelectItem>
                                ))
                            ) : (
                                <SelectItem value="0" disabled>
                                    No stations available
                                </SelectItem>
                            )}
                            </SelectContent>
                        </Select>

                        <FilterDropdown
                            activeFilter={activeFilter}
                            isLoggedIn={isLoggedIn}
                            handleFilterSelect={handleFilterSelect}
                            resetFilteredStations={resetFilteredStations}
                            setSortBy={setSortBy}
                            setFilterByStatus={setFilterByStatus}
                            setFilterByFavorite={setFilterByFavorite}
                            setActiveFilter={setActiveFilter}

                        />
                    </div>
                    {selectedStation ? <StationDetails
                        station={selectedStation}
                        filteredStations={filteredStations}
                        onPreviousStation={handlePreviousStation}
                        onNextStation={handleNextStation}
                        isMobile={isMobile}
                        toggleFavorite={toggleFavorite}
                    /> : <div >
                        <h1 className="text-center">No station selected. Please select a station to view details.</h1>

                    </div>}

                </div >

                {/* Login Modal */}
                <LoginModal
                    open={showLoginModal}
                    onOpenChange={setShowLoginModal}
                />

            </main>

        </>
    )
}