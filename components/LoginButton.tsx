"use client"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { BellRing, Camera, ChevronDown, CircleUser, Droplets, LogIn, LogOut, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import LoginModal from "@/components/LoginModel";


export function LoginButton() {

    const [showLoginModal, setShowLoginModal] = useState(false)

    return (
        <>
            <div className="flex items-center">
                <Button variant="ghost" size="sm" onClick={() => setShowLoginModal(true)} className="flex items-center">
                    <LogIn className="mr-2 h-4 w-4" />
                    <span className="hidden md:inline">Login</span>
                </Button>

            </div>
            <LoginModal
                open={showLoginModal}
                onOpenChange={setShowLoginModal}
            />

        </>


    )




}
