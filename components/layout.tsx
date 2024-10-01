import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useTheme } from "next-themes"
import { Droplet, Droplets, ChevronDown, LogIn, LogOut, UserPlus, Moon, Sun, Camera, Circle, CircleUser } from 'lucide-react'
import { Analytics } from '@vercel/analytics/react';
import { createClient } from '@supabase/supabase-js'
import { Toaster } from "@/components/ui/toaster"

import { useToast } from "@/hooks/use-toast"

import { useRouter } from 'next/router'
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import useUserStore from '../lib/store';
import LoginModal from '@/components/LoginModel';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
const supabase = createClient(supabaseUrl, supabaseKey)

export default function Layout({ children }: { children: React.ReactNode }) {
    const [activeTab, setActiveTab] = useState("stations")
    const { isLoggedIn, checkUserSession, register, login, logout } = useUserStore(); // Use Zustand state
    const [showLoginModal, setShowLoginModal] = useState(false)
    const [showRegisterModal, setShowRegisterModal] = useState(false)
    const [favorites, setFavorites] = useState<{ stations: number[], cameras: number[] }>({ stations: [], cameras: [] })
    const [isSideMenuExpanded, setIsSideMenuExpanded] = useState(true)
    const [isMobile, setIsMobile] = useState(false)
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    const router = useRouter()
    const { toast } = useToast()
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
    const [message, setMessage] = useState('')

    useEffect(() => {
        setMounted(true)

        checkUserSession();
    }, []);

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

    // useEffect(() => {
    //     const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    //         if (event === 'SIGNED_IN') {
    //             // setIsLoggedIn(true)
    //         } else if (event === 'SIGNED_OUT') {
    //             // setIsLoggedIn(false)
    //         }
    //     })
    //     return () => subscription.unsubscribe()
    // }, [])


    useEffect(() => {

        if (theme) {
            setTheme(theme)
        }
        checkActiveTab();
    }, [theme, setTheme])

    const checkActiveTab = () => {
        const currentPath = router.pathname;
        console.log(currentPath);
        if (currentPath.includes('/stations')) {
            setActiveTab('stations');
        } else if (currentPath.includes('/cameras')) {
            setActiveTab('cameras');
        }
    };

    const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setStatus('loading')
        const form = e.currentTarget
        const email = (form.elements.namedItem('email') as HTMLInputElement).value
        const password = (form.elements.namedItem('password') as HTMLInputElement).value
        const confirmPassword = (form.elements.namedItem('confirm-password') as HTMLInputElement).value
        if (password !== confirmPassword) {
            setStatus('error')
            setMessage('Passwords do not match')
            return
        }
        const isRegister = await register(email, password)

        if (!isRegister?.status) {
            setStatus('error')
            setMessage(isRegister?.error instanceof Error ? isRegister?.error.message : 'Registration failed')
        } else {
            toast({
                variant: "success",
                title: "Registration Successful",
                description: "Please check your email for verification link",
                duration: 2000,
            })
        }
        setStatus('idle')
        setShowRegisterModal(false)
    }

    const handleLogout = async () => {
        await logout(); // Use Zustand logout action
        setFavorites({ stations: [], cameras: [] })
    }

    const handleSocialLogin = async (provider: 'google' | 'facebook' | 'apple') => {
        const { error } = await supabase.auth.signInWithOAuth({ provider })
        if (error) {
            console.error(`Error logging in with ${provider}:`, error.message)
        } else {
            setShowLoginModal(false)
        }
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
                                <Button variant="ghost" size="sm" onClick={() => setShowRegisterModal(true)} className="flex items-center">
                                    <UserPlus className="mr-2 h-4 w-4" />
                                    <span className="hidden md:inline">Register</span>
                                </Button>
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
                                <Input id="register-email" name="email" type="email" placeholder="Enter your email" required />
                            </div>
                            <div>
                                <Label htmlFor="register-password">Password</Label>
                                <Input id="register-password" name="password" type="password" placeholder="Create a password" required />
                            </div>
                            <div>
                                <Label htmlFor="confirm-password">Confirm Password</Label>
                                <Input id="confirm-password" type="password" placeholder="Confirm your password" required />
                            </div>
                            <Button type="submit" className="w-full" disabled={status === 'loading'}>
                                {status === 'loading' ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Registering...
                                    </>
                                ) : (
                                    'Register'
                                )}
                            </Button>
                        </form>
                        {status === 'error' && (
                            <div className="flex items-center gap-2 text-red-600 mt-2">
                                <AlertCircle className="h-5 w-5" />
                                <span>{message}</span>
                            </div>
                        )}
                        <Separator className="my-4" />
                        <div className="space-y-2">
                            <Button onClick={() => handleSocialLogin('google')} variant="outline" className="w-full">
                                Register with Google
                            </Button>
                            {/* <Button onClick={() => handleSocialLogin('facebook')} variant="outline" className="w-full">
                                Register with Facebook
                            </Button>
                            <Button onClick={() => handleSocialLogin('apple')} variant="outline" className="w-full">
                                Register with Apple
                            </Button> */}
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
            <Analytics />
        </>
    )
}