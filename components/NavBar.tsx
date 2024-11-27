"use client";

import Link from "next/link"
import { usePathname } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Camera, Droplets, LogIn, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function NavBar() {
    const pathname = usePathname()

    const active = pathname == '/station-new' ? 'stations' : 'cameras';
    return (

        <header className="border-b px-4 py-2 flex justify-between items-center">
            <div className="flex items-center">
                <Tabs value={active}>
                    <TabsList>

                        <TabsTrigger value="stations">
                            <Link
                                href="/station-new"
                                className="flex"
                            >
                                <Droplets className="mr-2 h-4 w-4" />
                                <span className="hidden sm:inline">Stations</span>
                            </Link>
                            {/* <Droplets className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Stations</span> */}
                        </TabsTrigger>
                        <TabsTrigger value="cameras">
                            <Link
                                href="/camera-new"
                                className="flex"
                            >
                                <Camera className="mr-2 h-4 w-4" />
                                <span className="hidden sm:inline">Cameras</span>
                            </Link>
                            {/* <Camera className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Cameras</span> */}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
            <div className="flex items-center">
                <Button
                    variant="ghost"
                    size="icon"

                    className="mr-2"
                >
                    <Sun className="h-5 w-5" />
                </Button>
                <div className="flex items-center">
                    <Button variant="ghost" size="sm" className="flex items-center">
                        <LogIn className="mr-2 h-4 w-4" />
                        <span className="hidden md:inline">Login</span>
                    </Button>
                    {/* <Button variant="ghost" size="sm" onClick={() => setShowRegisterModal(true)} className="flex items-center">
                <UserPlus className="mr-2 h-4 w-4" />
                <span className="hidden md:inline">Register</span>
            </Button> */}
                </div>
            </div>
        </header>
    );
}