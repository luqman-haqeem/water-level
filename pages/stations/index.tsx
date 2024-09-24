import { useState, useMemo, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTheme } from "next-themes"
import { SlidersHorizontal, Star, ChevronLeft, ChevronRight, Expand } from 'lucide-react'
import AlertLevelBadge from "@/components/AlertLevelBadge";
import Image from 'next/image'
import formatTimestamp from '@/utils/timeUtils'
import { createClient } from '@supabase/supabase-js'

import { useRouter } from 'next/router';


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
            JPS_camera_id: string;

        };
    }[];
    cameras: {
        id: number;
        camera_name: string;
        img_url: string;
        JPS_camera_id: string;

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
                JPS_camera_id,
                img_url
            )
            `)
    if (stationsError) {
        console.error('Error fetching stations:', stationsError.message)
        // Handle error as needed, e.g., return an empty array or throw an error
        stations = []
    }


    return {
        props: {
            stations
        },
        revalidate: 180 // 3 minutes

    }
}

export default function Component({ stations, cameras }: ComponentProps) {
    const router = useRouter();
    const { stationId } = router.query;
    const [searchTerm, setSearchTerm] = useState("")
    const [showLoginModal, setShowLoginModal] = useState(false)

    const [selectedLocation, setSelectedLocation] = useState("All")
    const [selectedStation, setSelectedStation] = useState<ComponentProps['stations'][0] | null>(null)
    const [isLoggedIn, setIsLoggedIn] = useState(false)

    const [favorites, setFavorites] = useState<{ stations: number[], cameras: number[] }>({ stations: [], cameras: [] })
    const [isSideMenuExpanded, setIsSideMenuExpanded] = useState(true)
    const [isMobile, setIsMobile] = useState(false)


    const [sortBy, setSortBy] = useState<"name" | "waterLevel">("name");
    const [filterByStatus, setFilterByStatus] = useState<string | null>(null);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
            if (window.innerWidth < 768) {
                setIsSideMenuExpanded(false)
            }
        }
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])
    useEffect(() => {
        if (stationId) {
            const station = stations.find(s => s.id.toString() === stationId);
            if (station) setSelectedStation(station);
        }
    }, [stationId, stations]);


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

        return filtered.sort((a, b) => {
            if (sortBy === "name") {
                return a.station_name.localeCompare(b.station_name);
            } else {
                return (a.current_levels?.current_level || 0) - (b.current_levels?.current_level || 0);
            }
        });
    }, [searchTerm, selectedLocation, filterByStatus, sortBy]);

    const toggleFavorite = (type: 'station' | 'camera', id: number) => {
        if (!isLoggedIn) {
            setShowLoginModal(true)
            return
        }
        setFavorites(prev => {
            const key = type === 'station' ? 'stations' : 'cameras'
            const newFavorites = prev[key].includes(id)
                ? prev[key].filter(fav => fav !== id)
                : [...prev[key], id]
            return { ...prev, [key]: newFavorites }
        })
    }

    const handleStationChange = (stationId: string) => {
        const station = stations.find(s => s.id.toString() === stationId);
        if (station) {
            setSelectedStation(station);
            router.push(`/stations?stationId=${station.id}`, undefined, { shallow: true });

        }
    }


    const handlePreviousStation = () => {
        const currentIndex = stations.findIndex(s => s.id === selectedStation?.id)
        if (currentIndex > 0) handleStationChange(stations[currentIndex - 1].id.toString())
    }

    const handleNextStation = () => {
        const currentIndex = stations.findIndex(s => s.id === selectedStation?.id)
        if (currentIndex < stations.length - 1) handleStationChange(stations[currentIndex + 1].id.toString())
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

    return (
        <>
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
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" size="icon">
                                                <SlidersHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem onClick={() => setSortBy("name")}>Sort by Name</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setSortBy("waterLevel")}>Sort by Water Level</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setFilterByStatus(null)}>Clear Filter</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setFilterByStatus("0")}>Filter by Status: Normal</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setFilterByStatus("1")}>Filter by Status: Alert</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setFilterByStatus("2")}>Filter by Status: Warning</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setFilterByStatus("3")}>Filter by Status: Danger</DropdownMenuItem>
                                            {isLoggedIn && <DropdownMenuItem>Show Favorites</DropdownMenuItem>}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
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
                                                        <Star className={`h-4 w-4 ${favorites.stations.includes(station.id) ? 'fill-yellow-400' : ''}`} />
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
                    <div className={`flex-1 p-2 md:p-4 overflow-auto ${isMobile && isSideMenuExpanded ? 'hidden' : 'block'}`}>
                        <div className="block md:hidden pb-4">
                            <Select value={selectedStation?.id.toString() || ''} onValueChange={handleStationChange}>
                                <SelectTrigger className="w-full md:w-[300px] lg:w-[400px]">
                                    <SelectValue placeholder="Select station" />
                                </SelectTrigger>
                                <SelectContent>
                                    {stations.map(station => (
                                        <SelectItem key={station.id} value={station.id.toString()}>
                                            {station.station_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>


                        {/* Station details */}
                        {selectedStation ? (
                            <div className={`flex-1  overflow-auto pb-16 md:pb-4 ${isMobile && isSideMenuExpanded ? 'hidden' : 'block'}`}>


                                <h2 className="text-2xl font-bold mb-4">{selectedStation.station_name}</h2>
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
                                        <CardHeader className="p-4">
                                            <CardTitle className="text-sm font-medium">Status</CardTitle>
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
                                        {selectedStation?.cameras ?
                                            <div onClick={() => openFullscreen(`${bucketUrl}/images/${selectedStation?.cameras?.JPS_camera_id}.jpg`)} className="relative cursor-pointer">
                                                <Image
                                                    src={`${bucketUrl}/images/${selectedStation?.cameras?.JPS_camera_id}.jpg?` + selectedStation.current_levels?.updated_at}
                                                    key={selectedStation.current_levels?.updated_at}

                                                    // src={`/api/proxy-image/${selectedStation?.cameras?.JPS_camera_id}`}
                                                    width={500}
                                                    height={300}
                                                    alt="Live camera feed"
                                                    className="w-full rounded-md"
                                                    onError={(e) => e.currentTarget.src = '/nocctv.png'}
                                                    blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAUAB4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0ykZgoyxAHqaomO5xhVkAOM7pMnPOT16dO/4UrxXDqm4OWwhyHAAIxnI9aALwIIyDkGiqaxTqA5Z92TnLZGNvp9aLKTezkFyoVfvPu55z/SgC5RRRQAUUUUAf/9k="
                                                    placeholder="blur"

                                                ></Image>
                                                {/* <img src={`/api/proxy-image/${selectedStation?.cameras?.JPS_camera_id}`} width={500} height={300} alt="Live camera feed" className="w-full rounded-md" /> */}
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
                                        Station {stations.findIndex(s => s.id === selectedStation?.id) + 1} of {stations.length}
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
                            // <div className="flex-1 p-4 overflow-auto">
                            <div >
                                <p className="text-center text-muted-foreground">No station selected. Please select a station to view details.</p>
                            </div>
                        )}
                    </div>


                    {/* Fullscreen Modal */}
                    <Dialog open={isFullscreenOpen} onOpenChange={closeFullscreen}>

                        <DialogContent className="max-w-screen-lg p-0">
                            <DialogHeader className="md:p-4">
                                <DialogTitle className="sr-only">Fullscreen Camera Feed</DialogTitle>
                            </DialogHeader>
                            <div className="p-2 md:p-4 pt-4 ">
                                <Image
                                    key={Date.now()}
                                    src={fullscreenImageSrc}
                                    width={1920}
                                    height={1080}
                                    alt="Fullscreen camera feed"
                                    className="w-full h-auto rounded-md"
                                    onError={(e) => e.currentTarget.src = '/nocctv.png'}
                                    blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAUAB4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0ykZgoyxAHqaomO5xhVkAOM7pMnPOT16dO/4UrxXDqm4OWwhyHAAIxnI9aALwIIyDkGiqaxTqA5Z92TnLZGNvp9aLKTezkFyoVfvPu55z/SgC5RRRQAUUUUAf/9k="
                                    placeholder="blur"
                                />

                            </div>
                        </DialogContent>
                    </Dialog>


                </>
            )}

        </>

    )
}