"use client"
import { useState } from 'react';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Star, Info, ChevronLeft, ChevronRight, Expand } from "lucide-react";

import AlertLevelBadge from "@/components/AlertLevelBadge";
import FullscreenModal from "@/components/FullscreenModal";
import useUserStore from "@/lib/store";
import formatTimestamp from "@/utils/timeUtils";
import LoginModal from '@/components/LoginModel';

interface StationDetailsProps {
    station: {
        id: number;
        station_name: string;
        districts: {
            name: string;
        };
        current_levels: {
            current_level: number;
            updated_at: string;
            alert_level: string;
        };
        cameras: {
            img_url: string;
            jps_camera_id: string;
            is_enabled: boolean;
        };
        normal_water_level: number;
        alert_water_level: number;
        warning_water_level: number;
        danger_water_level: number;
        station_status: boolean;
    };
    isMobile?: boolean;
    filteredStations: any[];
    onPreviousStation: () => void;
    onNextStation: () => void;
    toggleFavorite: (type: "station", id: number) => void;

}

export default function StationDetails({
    station,
    isMobile = false,
    filteredStations,
    onPreviousStation,
    onNextStation,
    toggleFavorite

}: StationDetailsProps) {
    const { favStations } = useUserStore();
    const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
    const [fullscreenImageSrc, setFullscreenImageSrc] = useState("");
    const [showLoginModal, setShowLoginModal] = useState(false)

    const openFullscreen = () => {
        setFullscreenImageSrc(`/api/proxy-image/${station?.cameras?.jps_camera_id}`);
        setIsFullscreenOpen(true);
    };

    const closeFullscreen = () => {
        setIsFullscreenOpen(false);
    };

    return (
        <div className="flex-1 overflow-auto pb-16 md:pb-4">
            {/* Station Header */}
            <div className="flex items-center mb-4">
                <h2 className="text-2xl font-bold inline mr-2">{station.station_name}</h2>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation()
                        toggleFavorite('station', station.id)
                    }}

                >
                    <Star className={`h-4 w-4 ${favStations.includes(station.id.toString()) ? 'fill-yellow-400' : ''}`} />
                </Button>

                {!station.station_status && (
                    <Badge className='ml-2' variant="outline">
                        Station disabled
                    </Badge>
                )}
            </div>

            <p className="text-muted-foreground mb-4">{station.districts.name}</p>

            {/* Water Level and Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Current Water Level Card */}
                <Card>
                    <CardHeader className="p-4">
                        <CardTitle className="text-sm font-medium">Current Water Level</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <p className="text-2xl font-bold">{station.current_levels?.current_level} m</p>
                        <p className="text-xs text-muted-foreground">
                            Last updated: {formatTimestamp(station.current_levels?.updated_at)}
                        </p>
                    </CardContent>
                </Card>

                {/* Status Card with Water Level Info */}
                <Card>
                    <CardHeader className="p-4 md:pt-2">
                        <CardTitle className="text-sm font-medium flex items-center">
                            Status
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-white hover:bg-gray-700 ml-1 p-0">
                                        <Info className="h-4 w-4" />
                                        <span className="sr-only">Water level information</span>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-gray-900 border-gray-800">
                                    <div className="p-4">
                                        {[
                                            { level: 'Normal', value: station.normal_water_level, color: 'bg-secondary' },
                                            { level: 'Alert', value: station.alert_water_level, color: 'bg-alert' },
                                            { level: 'Warning', value: station.warning_water_level, color: 'bg-warning' },
                                            { level: 'Danger', value: station.danger_water_level, color: 'bg-destructive' }
                                        ].map((item) => (
                                            <div key={item.level} className="flex items-center mb-1 last:mb-0">
                                                <div className={`w-3 h-3 rounded-full mr-2 ${item.color}`} />
                                                <span className="text-white text-sm">{item.level}: {item.value} m</span>
                                            </div>
                                        ))}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <AlertLevelBadge
                            className="text-lg"
                            alert_level={Number(station.current_levels?.alert_level) || 0}
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Camera Feed Card */}
            <Card>
                <CardHeader className="p-4">
                    <CardTitle className="text-sm font-medium">Camera Feed</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    {station?.cameras && station?.cameras?.is_enabled ? (
                        <div
                            onClick={openFullscreen}
                            className="relative cursor-pointer"
                        >
                            <Image
                                key={station.current_levels?.updated_at}
                                src={`/api/proxy-image/${station?.cameras?.jps_camera_id}`}
                                width={500}
                                height={300}
                                alt="Live camera feed"
                                className="w-full rounded-md"
                                onError={(e) => e.currentTarget.src = '/nocctv.png'}
                                blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAUAB4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0ykZgoyxAHqaomO5xhVkAOM7pMnPOT16dO/4UrxXDqm4OWwhyHAAIxnI9aALwIIyDkGiqaxTqA5Z92TnLZGNvp9aLKTezkFyoVfvPu55z/SgC5RRRQAUUUUAf/9k="
                                placeholder="blur"
                                unoptimized
                            />
                            <div className="absolute top-0 right-0 m-2">
                                <Expand className="h-6 w-6 text-white bg-black bg-opacity-50 rounded-full p-1" />
                            </div>
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground">
                            No camera feed available.
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Mobile Navigation Footer */}
            {isMobile && (
                <footer className="fixed bottom-0 left-0 w-full bg-background border-t p-2 flex justify-between items-center md:hidden">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={onPreviousStation}
                        disabled={station.id === filteredStations[0].id}
                    >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="sr-only">Previous station</span>
                    </Button>
                    <div className="text-sm text-muted-foreground">
                        Station {filteredStations.findIndex(s => s.id === station.id) + 1} of {filteredStations.length}
                    </div>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={onNextStation}
                        disabled={station.id === filteredStations[filteredStations.length - 1].id}
                    >
                        <ChevronRight className="h-4 w-4" />
                        <span className="sr-only">Next station</span>
                    </Button>
                </footer>
            )}

            {/* Fullscreen Modal for Camera Feed */}
            <FullscreenModal
                open={isFullscreenOpen}
                onOpenChange={closeFullscreen}
                imageSrc={fullscreenImageSrc}
            />

            {/* Login Modal */}
            <LoginModal
                open={showLoginModal}
                onOpenChange={setShowLoginModal}
            />
        </div>
    );
}