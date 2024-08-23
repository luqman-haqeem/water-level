import { useState, useMemo, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useTheme } from "next-themes"
import { Droplet, Camera, ChevronDown, Search, SlidersHorizontal, Star, LogIn, LogOut, UserPlus, ChevronLeft, ChevronRight, Moon, Sun } from 'lucide-react'
import { ThemeProvider } from "@/components/theme-provider"



// Mock data for stations and cameras
const stations = [
    { id: 1, name: "KG. PASIR", location: "HULU LANGAT", waterLevel: 47.88, lastUpdated: "1 month ago", status: "Normal" },
    { id: 2, name: "BATU 9, HULU LANGAT", location: "HULU LANGAT", waterLevel: 37.08, lastUpdated: "1 month ago", status: "Normal" },
    { id: 3, name: "SG. KANTAN, KAJANG", location: "KAJANG", waterLevel: 26.05, lastUpdated: "1 month ago", status: "Normal" },
    { id: 4, name: "BATU 20, HULU LANGAT", location: "HULU LANGAT", waterLevel: 88.39, lastUpdated: "1 month ago", status: "Alert" },
    { id: 5, name: "KG. SESAPAN BKT. REMBAU", location: "REMBAU", waterLevel: 32.75, lastUpdated: "1 month ago", status: "Normal" },
]

const cameras = [
    { id: 1, name: "Camera 1", location: "HULU LANGAT" },
    { id: 2, name: "Camera 2", location: "KAJANG" },
    { id: 3, name: "Camera 3", location: "BATU 9" },
    { id: 4, name: "Camera 4", location: "KG. PASIR" },
]

export default function Component() {
    const [activeTab, setActiveTab] = useState("stations")
    const [searchTerm, setSearchTerm] = useState("")
    const [selectedLocation, setSelectedLocation] = useState("All")
    const [selectedStation, setSelectedStation] = useState(stations[0])
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [showLoginModal, setShowLoginModal] = useState(false)
    const [showRegisterModal, setShowRegisterModal] = useState(false)
    const [favorites, setFavorites] = useState<{ stations: number[], cameras: number[] }>({ stations: [], cameras: [] })
    const [isSideMenuExpanded, setIsSideMenuExpanded] = useState(true)
    const [isMobile, setIsMobile] = useState(false)
    const { theme, setTheme } = useTheme()

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

    const locations = useMemo(() => {
        const uniqueLocations = new Set(stations.map(station => station.location))
        return ["All", ...Array.from(uniqueLocations)]
    }, [])

    const filteredStations = useMemo(() => {
        return stations.filter(station =>
            (selectedLocation === "All" || station.location === selectedLocation) &&
            (station.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                station.location.toLowerCase().includes(searchTerm.toLowerCase()))
        )
    }, [searchTerm, selectedLocation])

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

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault()
        // Implement actual login logic here
        setIsLoggedIn(true)
        setShowLoginModal(false)
    }

    const handleRegister = (e: React.FormEvent) => {
        e.preventDefault()
        // Implement actual registration logic here
        setIsLoggedIn(true)
        setShowRegisterModal(false)
    }

    const handleLogout = () => {
        setIsLoggedIn(false)
        setFavorites({ stations: [], cameras: [] })
    }

    const handleSocialLogin = (provider: string) => {
        // Implement social login logic here
        console.log(`Logging in with ${provider}`)
        setIsLoggedIn(true)
        setShowLoginModal(false)
    }

    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >

            <div className="flex flex-col h-screen bg-background">
                {/* Header */}
                <header className="border-b px-4 py-2 flex justify-between items-center">
                    <div className="flex items-center">
                        <Droplet className="w-8 h-8 text-primary mr-4" />
                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsList>
                                <TabsTrigger value="stations">Stations</TabsTrigger>
                                <TabsTrigger value="cameras">Cameras</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                    <div className="flex items-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                            className="mr-2"
                        >
                            {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                        </Button>
                        {isLoggedIn ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                        My Account
                                        <ChevronDown className="ml-2 h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem onClick={handleLogout}>
                                        <LogOut className="mr-2 h-4 w-4" />
                                        Logout
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <div>
                                <Button variant="ghost" size="sm" onClick={() => setShowLoginModal(true)}>
                                    <LogIn className="mr-2 h-4 w-4" />
                                    Login
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setShowRegisterModal(true)}>
                                    <UserPlus className="mr-2 h-4 w-4" />
                                    Register
                                </Button>
                            </div>
                        )}
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {activeTab === "stations" && (
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
                                                    <DropdownMenuItem>Sort by Name</DropdownMenuItem>
                                                    <DropdownMenuItem>Sort by Water Level</DropdownMenuItem>
                                                    <DropdownMenuItem>Filter by Status</DropdownMenuItem>
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
                                                    className={`mb-2 cursor-pointer ${selectedStation.id === station.id ? 'border-primary' : ''}`}
                                                    onClick={() => {
                                                        setSelectedStation(station)
                                                        if (isMobile) setIsSideMenuExpanded(false)
                                                    }}
                                                >
                                                    <CardHeader className="p-4">
                                                        <div className="flex justify-between items-center">
                                                            <CardTitle className="text-sm font-medium">{station.name}</CardTitle>
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
                                                        <p className="text-xs text-muted-foreground">{station.location}</p>
                                                    </CardHeader>
                                                    <CardContent className="p-4 pt-0 flex justify-between items-center">
                                                        <div>
                                                            <p className="text-sm font-medium">{station.waterLevel} m</p>
                                                            <p className="text-xs text-muted-foreground">{station.lastUpdated}</p>
                                                        </div>
                                                        <Badge variant={station.status === "Normal" ? "secondary" : "destructive"}>{station.status}</Badge>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </ScrollArea>
                                    </div>
                                )}
                            </div>

                            {/* Station details */}
                            <div className={`flex-1 p-4 overflow-auto ${isMobile && isSideMenuExpanded ? 'hidden' : 'block'}`}>
                                <h2 className="text-2xl font-bold mb-4">{selectedStation.name}</h2>
                                <p className="text-muted-foreground mb-4">{selectedStation.location}</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <Card>
                                        <CardHeader className="p-4">
                                            <CardTitle className="text-sm font-medium">Current Water Level</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0">
                                            <p className="text-2xl font-bold">{selectedStation.waterLevel} m</p>
                                            <p className="text-xs text-muted-foreground">Last updated: {selectedStation.lastUpdated}</p>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader className="p-4">
                                            <CardTitle className="text-sm font-medium">Status</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0">
                                            <Badge variant={selectedStation.status === "Normal" ? "secondary" : "destructive"} className="text-lg">{selectedStation.status}</Badge>
                                        </CardContent>
                                    </Card>
                                </div>
                                <Card>
                                    <CardHeader className="p-4">
                                        <CardTitle className="text-sm font-medium">Live Camera Feed</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                        {/* <img src="/placeholder.svg?height=300&width=500" alt="Live camera feed" className="w-full rounded-md" /> */}
                                        <img src="https://placehold.co/500x300" alt="Live camera feed" className="w-full rounded-md" />
                                    </CardContent>
                                </Card>
                            </div>
                        </>
                    )}

                    {activeTab === "cameras" && (
                        <div className="flex-1 p-4 overflow-auto">
                            <h2 className="text-2xl font-bold mb-4">Camera Feeds</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {cameras.map((camera) => (
                                    <Card key={camera.id}>
                                        <CardHeader className="p-4">
                                            <div className="flex justify-between items-center">
                                                <CardTitle className="text-sm font-medium">{camera.name}</CardTitle>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => toggleFavorite('camera', camera.id)}
                                                >
                                                    <Star className={`h-4 w-4 ${favorites.cameras.includes(camera.id) ? 'fill-yellow-400' : ''}`} />
                                                </Button>
                                            </div>
                                            <p className="text-xs text-muted-foreground">{camera.location}</p>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0">
                                            {/* <img src="/placeholder.svg?height=200&width=350" alt={`${camera.name} feed`} className="w-full rounded-md" /> */}
                                            <img src="https://placehold.co/350x200" alt={`${camera.name} feed`} className="w-full rounded-md" />
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Login Modal */}
                <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Login</DialogTitle>
                            <DialogDescription>Enter your credentials to log in</DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" placeholder="Enter your email" required />
                            </div>
                            <div>
                                <Label htmlFor="password">Password</Label>
                                <Input id="password" type="password" placeholder="Enter your password" required />
                            </div>
                            <Button type="submit" className="w-full">Login</Button>
                        </form>
                        <Separator className="my-4" />
                        <div className="space-y-2">
                            <Button onClick={() => handleSocialLogin('Google')} variant="outline" className="w-full">
                                Login with Google
                            </Button>
                            <Button onClick={() => handleSocialLogin('Facebook')} variant="outline" className="w-full">
                                Login with Facebook
                            </Button>
                            <Button onClick={() => handleSocialLogin('Apple')} variant="outline" className="w-full">
                                Login with Apple
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Register Modal */}
                <Dialog open={showRegisterModal} onOpenChange={setShowRegisterModal}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Register</DialogTitle>
                            <DialogDescription>Create a new account</DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleRegister} className="space-y-4">
                            <div>
                                <Label htmlFor="register-email">Email</Label>
                                <Input id="register-email" type="email" placeholder="Enter your email" required />
                            </div>
                            <div>
                                <Label htmlFor="register-password">Password</Label>
                                <Input id="register-password" type="password" placeholder="Create a password" required />
                            </div>
                            <div>
                                <Label htmlFor="confirm-password">Confirm Password</Label>
                                <Input id="confirm-password" type="password" placeholder="Confirm your password" required />
                            </div>
                            <Button type="submit" className="w-full">Register</Button>
                        </form>
                        <Separator className="my-4" />
                        <div className="space-y-2">
                            <Button onClick={() => handleSocialLogin('Google')} variant="outline" className="w-full">
                                Register with Google
                            </Button>
                            <Button onClick={() => handleSocialLogin('Facebook')} variant="outline" className="w-full">
                                Register with Facebook
                            </Button>
                            <Button onClick={() => handleSocialLogin('Apple')} variant="outline" className="w-full">
                                Register with Apple
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

        </ThemeProvider>
    )
}