"use client";

import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link";
import { Camera, Droplets } from "lucide-react";

export default function NavBarTab() {
    const pathname = usePathname()

    const active = pathname == '/' ? 'stations' : 'cameras';

    return (

        <Tabs value={active}>
            <TabsList>

                <TabsTrigger value="stations">
                    <Link
                        href="/"
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
    );
}