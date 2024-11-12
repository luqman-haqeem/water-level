
import Head from 'next/head';
import { useState, useMemo, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTheme } from "next-themes"
import { Star, ChevronLeft, ChevronRight, Expand, RotateCw, Ellipsis, Info } from 'lucide-react'
import AlertLevelBadge from "@/components/AlertLevelBadge";

import Image from 'next/image'
import formatTimestamp from '@/utils/timeUtils'
import LoginModal from '@/components/LoginModel';
import FullscreenModal from '@/components/FullscreenModal';
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/router';
import useUserStore from '../../lib/store';
import FilterDropdown from '@/components/FilterDropdown';
import PullToRefresh from 'pulltorefreshjs';
import ReactDOMServer from 'react-dom/server';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
const supabase = createClient(supabaseUrl, supabaseKey)

const bucketUrl = 'https://hnqhytdyrehyflbymaej.supabase.co/storage/v1/object/public/cameras';

interface ComponentProps {
    stations: {
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

export async function getStaticProps() {

    let { data: stations, error: stationsError } = await supabase
        .from('stations')
        .select(`
            id,
            station_name,
            districts(
            name),
            current_levels (
            current_level, updated_at,alert_level),
            cameras (
                jps_camera_id,
                img_url,
                is_enabled
            ),
            normal_water_level,
            alert_water_level,
            warning_water_level,
            danger_water_level
            
            `)
    if (stationsError) {
        console.error('Error fetching stations:', stationsError.message)
        stations = []
    }
    return {
        props: {
            stations
        },
        revalidate: 180 // 3 minutes
    }
}

export default function Component({ stations }: ComponentProps) {

    const router = useRouter();
    const { stationId } = router.query;
    const [searchTerm, setSearchTerm] = useState("")
    const [showLoginModal, setShowLoginModal] = useState(false)
    const { theme, setTheme } = useTheme()

    const [selectedLocation, setSelectedLocation] = useState("All")
    const [selectedStation, setSelectedStation] = useState<ComponentProps['stations'][0] | null>(null)
    const { isLoggedIn, user, favStations, removeFavStation, addFavStation } = useUserStore();

    // const [favorites, setFavorites] = useState<{ stations: number[] }>({ stations: [] })
    const [isSideMenuExpanded, setIsSideMenuExpanded] = useState(false)
    const [isMobile, setIsMobile] = useState(true)

    const [sortBy, setSortBy] = useState<"name" | "waterLevel">("name");
    const [filterByStatus, setFilterByStatus] = useState<string | null>(null);
    const [filterByFavorite, setFilterByFavorite] = useState<boolean>(false);

    useEffect(() => {
        const checkMobile = () => {
            const isMobileDevice = window.innerWidth < 768;
            setIsMobile(isMobileDevice);
            setIsSideMenuExpanded(!isMobileDevice);
        }
        checkMobile();
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    useEffect(() => {
        if (stationId) {
            const station = stations.find(s => s.id.toString() === stationId);
            if (station) setSelectedStation(station);
        }
    }, [stationId, stations]);


    useEffect(() => {

        PullToRefresh.init({
            mainElement: 'main',
            onRefresh() {
                // Custom refresh logic
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve();
                        window.location.reload();
                    }, 1000);
                });
            },
            distThreshold: 60,
            distMax: 80,
            distReload: 50,
            distIgnore: 0,
            // iconArrow: '&#8675;',
            iconArrow: ReactDOMServer.renderToString(
                <div className={`flex justify-center items-center ${theme === 'dark' ? 'text-white' : 'text-stone-400'}`}>
                    <RotateCw />
                </div>
            ),
            iconRefreshing: ReactDOMServer.renderToString(
                <div className={`flex justify-center items-center pt-4 ${theme === 'dark' ? 'text-white' : 'text-stone-400'}`}>
                    <Ellipsis />
                </div>
            ),
            instructionsPullToRefresh: ReactDOMServer.renderToString(
                <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    Pull down to refresh
                </div>
            ),
            instructionsReleaseToRefresh: ReactDOMServer.renderToString(
                <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    Release to refresh
                </div>
            ),
            instructionsRefreshing: ReactDOMServer.renderToString(
                <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    Refreshing
                </div>
            ),
            refreshTimeout: 500,
            shouldPullToRefresh: () => !window.scrollY
        });
        return () => PullToRefresh.destroyAll();
    }, []);

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
    }, [searchTerm, selectedLocation, filterByStatus, filterByFavorite, sortBy, favStations]);
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
            setSelectedStation(station);
            router.push(`/stations?stationId=${station.id}`, undefined, { shallow: true });
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
            {(
                <>
                    {/* Collapsible Station list */}
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
                                                    <CardTitle className="text-sm font-medium">{station.station_name}</CardTitle>
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


                        {/* Station details */}
                        {selectedStation ? (
                            <div className={`flex-1  overflow-auto pb-16 md:pb-4 ${isMobile && isSideMenuExpanded ? 'hidden' : 'block'}`}>


                                <h2 className="text-2xl font-bold mb-4 inline">{selectedStation.station_name}</h2>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        toggleFavorite('station', selectedStation.id)
                                    }}

                                >
                                    <Star className={`h-4 w-4 ${favStations.includes(selectedStation.id.toString()) ? 'fill-yellow-400' : ''}`} />
                                </Button>
                                <p className="text-muted-foreground mb-4">{selectedStation.districts.name}</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <Card>
                                        <CardHeader className="p-4">
                                            <CardTitle className="text-sm font-medium">Current Water Level</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0">
                                            <p className="text-2xl font-bold">{selectedStation.current_levels?.current_level} m</p>
                                            <p className="text-xs text-muted-foreground">Last updated: {formatTimestamp(selectedStation.current_levels?.updated_at)}</p>

                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader className="p-4 md:pt-2">

                                            <CardTitle className="text-sm font-medium  flex items-center">
                                                Status
                                                <Popover >
                                                    <PopoverTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="text-white hover:bg-gray-700 ml-1 p-0">
                                                            <Info className="h-4 w-4" />
                                                            <span className="sr-only">Water level information</span>
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0 bg-gray-900 border-gray-800">
                                                        <div className="p-4">
                                                            <div className="flex items-center mb-1 last:mb-0">
                                                                <div className={`w-3 h-3 rounded-full mr-2 bg-secondary`} />
                                                                <span className="text-white text-sm">Normal: {selectedStation?.normal_water_level} m</span>
                                                            </div>
                                                            <div className="flex items-center mb-1 last:mb-0">
                                                                <div className={`w-3 h-3 rounded-full mr-2 bg-alert`} />
                                                                <span className="text-white text-sm">Alert: {selectedStation?.alert_water_level} m</span>
                                                            </div>
                                                            <div className="flex items-center mb-1 last:mb-0">
                                                                <div className={`w-3 h-3 rounded-full mr-2 bg-warning`} />
                                                                <span className="text-white text-sm">Warning: {selectedStation?.warning_water_level} m</span>
                                                            </div>
                                                            <div className="flex items-center mb-1 last:mb-0">
                                                                <div className={`w-3 h-3 rounded-full mr-2 bg-destructive`} />
                                                                <span className="text-white text-sm">Danger: {selectedStation?.danger_water_level} m</span>
                                                            </div>
                                                        </div>
                                                    </PopoverContent>
                                                </Popover>
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0">

                                            {/* <Badge variant={selectedStation.current_levels?.alert_level === "Normal" ? "secondary" : "destructive"} className="text-lg">{selectedStation.current_levels?.alert_level}</Badge> */}
                                            <AlertLevelBadge className="text-lg" alert_level={Number(selectedStation.current_levels?.alert_level) || 0} />

                                        </CardContent>
                                    </Card>
                                </div>
                                <Card>
                                    <CardHeader className="p-4">
                                        <CardTitle className="text-sm font-medium"> Camera Feed</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                        {selectedStation?.cameras && selectedStation?.cameras?.is_enabled ?
                                            <div onClick={() =>
                                                // openFullscreen(`${bucketUrl}/images/${selectedStation?.cameras?.jps_camera_id}.jpg?` + selectedStation.current_levels?.updated_at)}
                                                openFullscreen(`/api/proxy-image/${selectedStation?.cameras?.jps_camera_id}`)}
                                                className="relative cursor-pointer">
                                                <Image
                                                    // src={`${bucketUrl}/images/${selectedStation?.cameras?.jps_camera_id}.jpg?` + selectedStation.current_levels?.updated_at}
                                                    key={selectedStation.current_levels?.updated_at}

                                                    src={`/api/proxy-image/${selectedStation?.cameras?.jps_camera_id}`}
                                                    width={500}
                                                    height={300}
                                                    alt="Live camera feed"
                                                    className="w-full rounded-md"
                                                    onError={(e) => e.currentTarget.src = '/nocctv.png'}
                                                    blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAUAB4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0ykZgoyxAHqaomO5xhVkAOM7pMnPOT16dO/4UrxXDqm4OWwhyHAAIxnI9aALwIIyDkGiqaxTqA5Z92TnLZGNvp9aLKTezkFyoVfvPu55z/SgC5RRRQAUUUUAf/9k="
                                                    placeholder="blur"
                                                    unoptimized

                                                ></Image>
                                                {/* <img src={`/api/proxy-image/${selectedStation?.cameras?.jps_camera_id}`} width={500} height={300} alt="Live camera feed" className="w-full rounded-md" /> */}
                                                <div className="absolute top-0 right-0 m-2">
                                                    <Expand className="h-6 w-6 text-white bg-black bg-opacity-50 rounded-full p-1" />
                                                </div>
                                            </div>
                                            : <p className="text-center text-muted-foreground">No camera feed available.</p>}
                                    </CardContent>
                                </Card>
                                {/* Navigation Footer */}
                                <footer className="fixed bottom-0 left-0 w-full bg-background border-t p-2 flex justify-between items-center md:hidden">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={handlePreviousStation}
                                        disabled={selectedStation?.id === stations[0].id}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                        <span className="sr-only">Previous station</span>
                                    </Button>
                                    <div className="text-sm text-muted-foreground">
                                        Station {filteredStations.findIndex(s => s.id === selectedStation?.id) + 1} of {filteredStations.length}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={handleNextStation}
                                        disabled={selectedStation?.id === stations[stations.length - 1].id}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                        <span className="sr-only">Next station</span>
                                    </Button>
                                </footer>
                            </div>

                        ) : (
                            <div >
                                <h1 className="text-center">No station selected. Please select a station to view details.</h1>

                            </div>
                        )}
                    </div >

                    <FullscreenModal open={isFullscreenOpen} onOpenChange={closeFullscreen} imageSrc={fullscreenImageSrc}></FullscreenModal>

                    {/* Login Modal */}
                    <LoginModal
                        open={showLoginModal}
                        onOpenChange={setShowLoginModal}
                    />
                </>


            )
            }

        </>

    )
}