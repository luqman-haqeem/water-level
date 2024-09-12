import { useState, useMemo, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useTheme } from "next-themes"
import { Droplet, ChevronDown, SlidersHorizontal, Star, LogIn, LogOut, UserPlus, ChevronLeft, ChevronRight, Moon, Sun, Expand } from 'lucide-react'
import AlertLevelBadge from "@/components/AlertLevelBadge";
import Image from 'next/image'
import formatTimestamp from '@/utils/timeUtils'
import { createClient } from '@supabase/supabase-js'


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
const supabase = createClient(supabaseUrl, supabaseKey)


interface ComponentProps {

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
    // Mock data for stations and cameras


    let { data: cameras, error: camerasError } = await supabase
        .from('cameras')
        .select('id,camera_name,img_url,JPS_camera_id,districts(name)')
        .eq('is_enabled', 'TRUE')


    // console.log(cameras);
    if (camerasError) {
        console.error('Error fetching camera:', camerasError.message)
        // Handle error as needed, e.g., return an empty array or throw an error
        cameras = []
    }

    return {
        props: {
            cameras
        }
    }
}

export default function Component({ cameras }: ComponentProps) {
    const [activeTab, setActiveTab] = useState("stations")
    const [searchTerm, setSearchTerm] = useState("")
    const [selectedLocation, setSelectedLocation] = useState("All")
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [showLoginModal, setShowLoginModal] = useState(false)
    const [showRegisterModal, setShowRegisterModal] = useState(false)
    const [favorites, setFavorites] = useState<{ stations: number[], cameras: number[] }>({ stations: [], cameras: [] })
    const [isSideMenuExpanded, setIsSideMenuExpanded] = useState(true)
    const [isMobile, setIsMobile] = useState(false)
    const { theme, setTheme } = useTheme()


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
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                setIsLoggedIn(true)
            } else if (event === 'SIGNED_OUT') {
                setIsLoggedIn(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    useEffect(() => {
        if (theme) {
            setTheme(theme)
        }
    }, [theme, setTheme])


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

    const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const form = e.currentTarget
        const email = (form.elements.namedItem('email') as HTMLInputElement).value
        const password = (form.elements.namedItem('password') as HTMLInputElement).value

        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
            console.error('Error logging in:', error.message)
        } else {
            setShowLoginModal(false)
        }
    }

    const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const form = e.currentTarget
        const email = (form.elements.namedItem('email') as HTMLInputElement).value
        const password = (form.elements.namedItem('password') as HTMLInputElement).value

        const { error } = await supabase.auth.signUp({ email, password })
        if (error) {
            console.error('Error registering:', error.message)
        } else {
            setShowRegisterModal(false)
        }
    }

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut()
        if (error) {
            console.error('Error logging out:', error.message)
        } else {
            setFavorites({ stations: [], cameras: [] })
        }
    }

    const handleSocialLogin = async (provider: 'google' | 'facebook' | 'apple') => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            // options: {
            //     queryParams: {
            //         access_type: 'offline',
            //         prompt: 'consent',
            //     },
            //     redirectTo: "https://hnqhytdyrehyflbymaej.supabase.co/auth/v1/callback",
            // },
        })
        if (error) {
            console.error(`Error logging in with ${provider}:`, error.message)
        } else {
            setShowLoginModal(false)
        }

    }
    const handleStationChange = (stationId: string) => {
        const station = stations.find(s => s.id.toString() === stationId)
        if (station) setSelectedStation(station)
    }

    const handlePreviousStation = () => {
        const currentIndex = stations.findIndex(s => s.id === selectedStation?.id)
        if (currentIndex > 0) setSelectedStation(stations[currentIndex - 1])
    }

    const handleNextStation = () => {
        const currentIndex = stations.findIndex(s => s.id === selectedStation?.id)
        if (currentIndex < stations.length - 1) setSelectedStation(stations[currentIndex + 1])
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

            <div className="flex flex-col h-screen bg-background">
                {(
                    <div className="flex-1 p-4 overflow-auto">
                        <h2 className="text-2xl font-bold mb-4">Camera Feeds</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {cameras.map((camera) => (
                                <Card key={camera.id}>
                                    <CardHeader className="p-4">
                                        <div className="flex justify-between items-center">
                                            <CardTitle className="text-sm font-medium">{camera.camera_name}</CardTitle>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => toggleFavorite('camera', camera.id)}
                                            >
                                                <Star className={`h-4 w-4 ${favorites.cameras.includes(camera.id) ? 'fill-yellow-400' : ''}`} />
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{camera.districts.name}</p>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                        <Image src={`/api/proxy-image/${camera?.JPS_camera_id}`}
                                            width={600}
                                            height={330}
                                            alt={`${camera.camera_name} feed`}
                                            className="w-full rounded-md"
                                            onError={(e) => e.currentTarget.src = '/nocctv.png'}
                                            blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAUAB4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0ykZgoyxAHqaomO5xhVkAOM7pMnPOT16dO/4UrxXDqm4OWwhyHAAIxnI9aALwIIyDkGiqaxTqA5Z92TnLZGNvp9aLKTezkFyoVfvPu55z/SgC5RRRQAUUUUAf/9k="
                                            placeholder="blur"
                                            unoptimized></Image>


                                        {/* <img src={`/api/proxy-image/${camera?.JPS_camera_id}`} width={500}
                                                height={200} alt={`${camera.camera_name} feed`} className="w-full rounded-md" /> */}

                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {/* Fullscreen Modal */}
                <Dialog open={isFullscreenOpen} onOpenChange={closeFullscreen}>
                    <DialogContent className="max-w-screen-lg p-0">
                        {/* <DialogHeader className="p-4">
                            <DialogTitle>Fullscreen Camera Feed</DialogTitle>
                        </DialogHeader> */}
                        <div className="p-4 pt-10">
                            <Image src={fullscreenImageSrc}
                                width={1920}
                                height={1080}
                                alt="Fullscreen camera feed"
                                className="w-full h-auto rounded-md"
                                onError={(e) => e.currentTarget.src = '/nocctv.png'}
                                blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAUAB4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0ykZgoyxAHqaomO5xhVkAOM7pMnPOT16dO/4UrxXDqm4OWwhyHAAIxnI9aALwIIyDkGiqaxTqA5Z92TnLZGNvp9aLKTezkFyoVfvPu55z/SgC5RRRQAUUUUAf/9k="
                                placeholder="blur"
                                unoptimized />

                        </div>
                    </DialogContent>
                </Dialog>


            </div >




        </>

    )
}