"use client"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { BellRing, Camera, ChevronDown, CircleUser, Droplets, LogIn, LogOut, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import useUserStore from "@/lib/store";
import { useState } from "react";
import NotificationHandler from "@/components/NotificationHandler";
import { signOutAction } from "@/app/action";

export function UserHeaderDropdown(user: any) {

    const [showNotificationModel, setShowNotificationModel] = useState(false)

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
                    <DropdownMenuItem onClick={signOutAction}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Logout
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu >
            {/* Notification Modal */}
            <NotificationHandler userId={user?.id ?? ''} open={showNotificationModel} onOpenChange={setShowNotificationModel} /></>

    )



}
