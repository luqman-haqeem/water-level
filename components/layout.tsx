import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

import { useTheme } from "next-themes"
import { Droplets, ChevronDown, LogIn, LogOut, UserPlus, Moon, Sun, Camera, BellRing, CircleUser } from 'lucide-react'
import { Analytics } from '@vercel/analytics/react';
import { Toaster } from "@/components/ui/toaster"
import NotificationHandler from '@/components/NotificationHandler';

import { useRouter } from 'next/router'
import useUserStore from '@/lib/store';
import LoginModal from '@/components/LoginModel';

export default function Layout({ children }: { children: React.ReactNode }) {
    const [activeTab, setActiveTab] = useState("stations")
    const { isLoggedIn, checkUserSession, user, listenSessionChanges, logout } = useUserStore(); // Use Zustand state
    const [showLoginModal, setShowLoginModal] = useState(false)
    const [showNotificationModel, setShowNotificationModel] = useState(false)
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    const router = useRouter()

    useEffect(() => {
        setMounted(true)

        checkUserSession();
        listenSessionChanges();
    }, []);

    useEffect(() => {

        if (theme) {
            setTheme(theme)
        }
        checkActiveTab();
    }, [theme, setTheme])

    const checkActiveTab = () => {
        const currentPath = router.pathname;
        // console.log(currentPath);
        if (currentPath.includes('/stations')) {
            setActiveTab('stations');
        } else if (currentPath.includes('/cameras')) {
            setActiveTab('cameras');
        }
    };

    const handleLogout = async () => {
        await logout();
    }

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
                <header className="border-b px-4 py-2 flex justify-between items-center">
                    <div className="flex items-center">
                        <Tabs value={activeTab} onValueChange={handleTabChange}>
                            <TabsList>
                                <TabsTrigger value="stations">
                                    <Droplets className="mr-2 h-4 w-4" />
                                    <span className="hidden sm:inline">Stations</span>
                                </TabsTrigger>
                                <TabsTrigger value="cameras">
                                    <Camera className="mr-2 h-4 w-4" />
                                    <span className="hidden sm:inline">Cameras</span>
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                    <div className="flex items-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                            className="mr-2"
                        >
                            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                        </Button>
                        {isLoggedIn ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                        <CircleUser className="mr-2 h-4 w-4" />
                                        <span className="hidden md:inline">My Account</span>
                                        <ChevronDown className="ml-2 h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem onClick={() => setShowNotificationModel(true)} >
                                        <BellRing className="mr-2 h-4 w-4" />
                                        Notification
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleLogout}>
                                        <LogOut className="mr-2 h-4 w-4" />
                                        Logout
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <div className="flex items-center">
                                <Button variant="ghost" size="sm" onClick={() => setShowLoginModal(true)} className="flex items-center">
                                    <LogIn className="mr-2 h-4 w-4" />
                                    <span className="hidden md:inline">Login</span>
                                </Button>
                                {/* <Button variant="ghost" size="sm" onClick={() => setShowRegisterModal(true)} className="flex items-center">
                                    <UserPlus className="mr-2 h-4 w-4" />
                                    <span className="hidden md:inline">Register</span>
                                </Button> */}
                            </div>
                        )}
                    </div>
                </header>

                {/* Content */}
                <main className="flex-1 flex overflow-hidden">
                    {children}
                </main>
                <Toaster />

                {/* Login Modal */}
                <LoginModal
                    open={showLoginModal}
                    onOpenChange={setShowLoginModal}

                />
                {/* Notification Modal */}
                <NotificationHandler userId={user?.id ?? ''} open={showNotificationModel} onOpenChange={setShowNotificationModel} />


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