import React, { useState } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Expand, Wifi, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { haptics } from '@/utils/haptics'
import {
    CameraIcon,
    LocationIcon,
} from '@/components/icons/IconLibrary'
import { Id } from "../../convex/_generated/dataModel"
import { cameraImageUrl } from "@/lib/cameraImageUrl"
import { snapshotBaseUrl } from "@/lib/snapshotEnv"
import formatTimestamp from "@/utils/timeUtils"

interface Camera {
    id: Id<"cameras"> | number
    camera_name: string
    img_url: string | undefined
    jps_camera_id: string
    captured_at?: string | null
    districts: {
        name: string
    }
}

interface CameraCardProps {
    camera: Camera
    onImageClick?: (imageUrl: string) => void
    className?: string
}

export default function CameraCard({
    camera,
    onImageClick,
    className
}: CameraCardProps) {
    const [isImageLoading, setIsImageLoading] = useState(true)
    const [hasImageError, setHasImageError] = useState(false)
    const [imageKey, setImageKey] = useState(0)

    const imageUrl = cameraImageUrl(snapshotBaseUrl(), camera.jps_camera_id, camera.captured_at)

    const handleImageLoad = () => {
        setIsImageLoading(false)
        setHasImageError(false)
    }

    const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
        setIsImageLoading(false)
        setHasImageError(true)
        e.currentTarget.src = '/nocctv.png'
    }

    const handleRefreshImage = (e: React.MouseEvent) => {
        e.stopPropagation()
        haptics.tap()
        setIsImageLoading(true)
        setHasImageError(false)
        setImageKey(prev => prev + 1)
    }

    const handleImageClick = () => {
        if (!hasImageError) {
            haptics.tap()
            onImageClick?.(imageUrl)
        }
    }

    return (
        <Card
            className={cn(
                "transition-all duration-200 hover:shadow-md overflow-hidden theme-transition-colors",
                "border border-border/50 hover:border-primary/50",
                className
            )}
        >
            <CardContent className="p-0">
                {/* Image Section */}
                <div className="relative group">
                    <div
                        className="relative aspect-video w-full cursor-pointer overflow-hidden"
                        onClick={handleImageClick}
                    >
                        <img
                            key={imageKey}
                            src={imageUrl}
                            alt={`${camera.camera_name} feed`}
                            className={cn(
                                "w-full h-full object-cover transition-all duration-300",
                                isImageLoading ? "opacity-0" : "opacity-100",
                                !hasImageError && "group-hover:scale-105"
                            )}
                            onError={handleImageError}
                            onLoad={handleImageLoad}
                            loading="lazy"
                        />

                        {camera.captured_at && (
                            <span className="absolute bottom-1 right-2 text-[11px] text-white/90 bg-black/50 px-1.5 py-0.5 rounded">
                                Captured {formatTimestamp(camera.captured_at)}
                            </span>
                        )}

                        {/* Loading spinner */}
                        {isImageLoading && (
                            <div className="absolute inset-0 bg-muted/50 flex items-center justify-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            </div>
                        )}

                        {/* Overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200" />

                        {/* Controls overlay */}
                        <div className="absolute top-2 right-2 flex gap-1">
                            {(hasImageError || !isImageLoading) && (
                                <button
                                    onClick={handleRefreshImage}
                                    className={cn(
                                        "bg-black/50 backdrop-blur-sm rounded-full p-2 transition-opacity duration-200",
                                        hasImageError ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                    )}
                                    title="Refresh image"
                                >
                                    <RefreshCw className="h-3 w-3 text-white" />
                                </button>
                            )}

                            {!hasImageError && (
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    <div className="bg-black/50 backdrop-blur-sm rounded-full p-2">
                                        <Expand className="h-3 w-3 text-white" />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Connection quality indicator */}
                        {!hasImageError && (
                            <div className="absolute bottom-2 left-2">
                                <div className="bg-black/50 backdrop-blur-sm rounded px-2 py-1 flex items-center gap-1">
                                    <Wifi className="h-3 w-3 text-green-400" />
                                    <span className="text-white text-xs">HD</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Info Section */}
                <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <CameraIcon size="sm" className="flex-shrink-0" />
                                <h3 className="text-station-name truncate">{camera.camera_name}</h3>
                            </div>
                            <div className="flex items-center gap-1 text-metadata">
                                <LocationIcon size="xs" />
                                <span className="truncate">{camera.districts.name}</span>
                            </div>
                        </div>
                    </div>

                    {/* Status Row */}
                    <div className="flex items-center justify-between text-caption">
                        <div className="flex items-center gap-2 text-success">
                            <div className="w-2 h-2 bg-success rounded-full"></div>
                            <span>Online</span>
                        </div>
                        <span className="text-metadata">Updated now</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
