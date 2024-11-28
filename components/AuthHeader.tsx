"use client"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { BellRing, Camera, ChevronDown, CircleUser, Droplets, LogIn, LogOut, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import useUserStore from "@/lib/store";
import { useState } from "react";
import NotificationHandler from "./NotificationHandler";
import LoginModal from "./LoginModel";


export function AuthHeader() {

    const { isLoggedIn, user, logout } = useUserStore();
    const [showLoginModal, setShowLoginModal] = useState(false)
    const [showNotificationModel, setShowNotificationModel] = useState(false)
    const handleLogout = async () => {
        await logout();
    }

    if (isLoggedIn) {
        return (
            <>
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
                </DropdownMenu >
                {/* Notification Modal */}
                <NotificationHandler userId={user?.id ?? ''} open={showNotificationModel} onOpenChange={setShowNotificationModel} /></>

        )
    } else {
        return (
            <>
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
                <LoginModal
                    open={showLoginModal}
                    onOpenChange={setShowLoginModal}
                />

            </>


        )

    }


}
