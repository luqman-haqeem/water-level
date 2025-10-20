import { useState, useEffect, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

import { useTheme } from "next-themes"
import { ChevronDown, BellRing, CircleUser } from 'lucide-react'
import { Analytics } from '@vercel/analytics/react';
import { 
  WaterIcon, 
  CameraIcon, 
  LoginIcon, 
  LogoutIcon, 
  LightModeIcon, 
  DarkModeIcon, 
  UserIcon 
} from '@/components/icons/IconLibrary'
import { Toaster } from "@/components/ui/toaster"
import NotificationHandler from '@/components/NotificationHandler';
import BottomNavigation from '@/components/BottomNavigation';
import { HighContrastToggle } from '@/components/HighContrastToggle';

import { useRouter } from 'next/router'
// import { useUserStore } from '../lib/convexStore';
// import LoginModal from '@/components/LoginModel';
import { FilterProvider } from '../lib/FilterContext';

export default function Layout({ children }: { children: React.ReactNode }) {
    const [activeTab, setActiveTab] = useState("stations")
    // const { isLoggedIn, user, logout } = useUserStore(); // Use Convex store
    const isLoggedIn = false; // Commented out login functionality
    // const [showLoginModal, setShowLoginModal] = useState(false)
    // const [showNotificationModel, setShowNotificationModel] = useState(false)
    const [isMobile, setIsMobile] = useState(false)
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    const router = useRouter()

    useEffect(() => {
        setMounted(true)
        // Convex handles session management automatically
        
        // Check if mobile
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }
        checkMobile()
        window.addEventListener('resize', checkMobile)
        
        return () => window.removeEventListener('resize', checkMobile)
    }, []);

    const checkActiveTab = useCallback(() => {
        const currentPath = router.pathname;
        // console.log(currentPath);
        if (currentPath.includes('/stations')) {
            setActiveTab('stations');
        } else if (currentPath.includes('/cameras')) {
            setActiveTab('cameras');
        }
    }, [router.pathname]);

    useEffect(() => {

        if (theme) {
            setTheme(theme)
        }
        checkActiveTab();
    }, [theme, setTheme, checkActiveTab])


    // const handleLogout = async () => {
    //     await logout();
    // }

    const handleTabChange = (value: string) => {
        setActiveTab(value)
        if (value === "stations") {
            router.push('/stations')
        } else if (value === "cameras") {
            router.push('/cameras')
        }
    }



    if (!mounted) {
        return null
    }

    return (
        <>
            <div className="flex flex-col h-screen bg-background">
                {/* Header */}
                <header className="border-b px-4 py-3 flex justify-between items-center min-h-touch">
                    {!isMobile && (
                        <div className="flex items-center">
                            <Tabs value={activeTab} onValueChange={handleTabChange}>
                                <TabsList className="h-10">
                                    <TabsTrigger value="stations" className="h-10 px-3 min-w-[60px]">
                                        <WaterIcon size="sm" className="sm:mr-2" />
                                        <span className="hidden sm:inline sm:ml-1">Stations</span>
                                    </TabsTrigger>
                                    <TabsTrigger value="cameras" className="h-10 px-3 min-w-[60px]">
                                        <CameraIcon size="sm" className="sm:mr-2" />
                                        <span className="hidden sm:inline sm:ml-1">Cameras</span>
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                    )}
                    {isMobile && (
                        <div className="flex items-center">
                            <WaterIcon size="lg" className="text-primary mr-2" />
                            <span className="text-heading-3">Water Level Monitor</span>
                        </div>
                    )}
                    <div className="flex items-center gap-1">
                        <HighContrastToggle />
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                            className="min-w-touch min-h-touch theme-transition-colors"
                        >
                            <div className="relative w-5 h-5">
                                <div className={`absolute inset-0 transform transition-all duration-300 ease-in-out ${
                                    theme === "dark" 
                                        ? "rotate-0 scale-100 opacity-100" 
                                        : "rotate-90 scale-0 opacity-0"
                                }`}>
                                    <LightModeIcon size="md" />
                                </div>
                                <div className={`absolute inset-0 transform transition-all duration-300 ease-in-out ${
                                    theme === "dark" 
                                        ? "-rotate-90 scale-0 opacity-0" 
                                        : "rotate-0 scale-100 opacity-100"
                                }`}>
                                    <DarkModeIcon size="md" />
                                </div>
                            </div>
                            <span className="sr-only">Toggle theme</span>
                        </Button>
                        {/* Login/Logout functionality commented out */}
                        {/* {isLoggedIn ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="min-w-touch min-h-touch px-3">
                                        <CircleUser className="w-5 h-5 sm:mr-2" />
                                        <span className="sr-only sm:not-sr-only sm:ml-1">My Account</span>
                                        <ChevronDown className="w-4 h-4 ml-1" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onClick={() => setShowNotificationModel(true)} className="py-3">
                                        <BellRing className="mr-3 h-4 w-4" />
                                        Notification
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleLogout} className="py-3">
                                        <LogoutIcon size="sm" className="mr-3" />
                                        Logout
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <Button variant="ghost" onClick={() => setShowLoginModal(true)} className="min-w-touch min-h-touch px-3">
                                <LoginIcon size="md" className="sm:mr-2" />
                                <span className="sr-only sm:not-sr-only sm:ml-1">Login</span>
                            </Button>
                        )} */}
                    </div>
                </header>

                {/* Content */}
                <main className={`flex-1 flex overflow-hidden ${isMobile ? 'pb-20' : 'pb-safe-bottom'}`}>
                    <FilterProvider>
                        {children}
                    </FilterProvider>
                </main>
                
                {/* Mobile Bottom Navigation */}
                {isMobile && (
                    <BottomNavigation
                        activeTab={activeTab}
                        onTabChange={handleTabChange}
                        showFavorites={false}
                        showFilters={false}
                    />
                )}
                
                <Toaster />

                {/* Login Modal - Commented out */}
                {/* <LoginModal
                    open={showLoginModal}
                    onOpenChange={setShowLoginModal}

                /> */}
                {/* Notification Modal - Commented out */}
                {/* <NotificationHandler userId={user?.id ?? ''} open={showNotificationModel} onOpenChange={setShowNotificationModel} /> */}


                {/* Register Modal */}
                {/* <RegisterModel
                    open={showRegisterModal}
                    onOpenChange={setShowRegisterModal}
                /> */}
            </div >
            <Analytics />
        </>
    )
}