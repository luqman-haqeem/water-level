import React, { useState } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Expand, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { haptics } from '@/utils/haptics'
import {
    CameraIcon,
    LocationIcon,
    FavoriteIcon,
    OnlineIcon
} from '@/components/icons/IconLibrary'
import Image from 'next/image'
import { Id } from "../convex/_generated/dataModel"

interface Camera {
    id: Id<"cameras"> | number
    camera_name: string
    img_url: string | undefined
    jps_camera_id: string
    districts: {
        name: string
    }
}

interface CameraCardProps {
    camera: Camera
    isFavorite: boolean
    onToggleFavorite: (id: Id<"cameras"> | number) => void
    onImageClick?: (imageUrl: string) => void
    className?: string
}

export default function CameraCard({
    camera,
    isFavorite,
    onToggleFavorite,
    onImageClick,
    className
}: CameraCardProps) {
    const [isImageLoading, setIsImageLoading] = useState(true)
    const [hasImageError, setHasImageError] = useState(false)
    const [imageKey, setImageKey] = useState(0)

    const imageUrl = `/api/proxy-image/${camera.jps_camera_id}`

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
                        className="relative aspect-video w-full cursor-pointer"
                        onClick={handleImageClick}
                    >
                        <Image
                            key={imageKey}
                            src={imageUrl}
                            fill
                            alt={`${camera.camera_name} feed`}
                            className={cn(
                                "object-cover transition-all duration-300",
                                isImageLoading ? "opacity-0" : "opacity-100",
                                !hasImageError && "group-hover:scale-105"
                            )}
                            onError={handleImageError}
                            onLoad={handleImageLoad}
                            placeholder="blur"
                            blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAUAB4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0ykZgoyxAHqaomO5xhVkAOM7pMnPOT16dO/4UrxXDqm4OWwhyHAAIxnI9aALwIIyDkGiqaxTqA5Z92TnLZGNvp9aLKTezkFyoVfvPu55z/SgC5RRRQAUUUUAf/9k="
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            loading="lazy"
                            unoptimized
                        />

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
                            {/* Refresh button (shown on error or hover) */}
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

                            {/* Expand button */}
                            {!hasImageError && (
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    <div className="bg-black/50 backdrop-blur-sm rounded-full p-2">
                                        <Expand className="h-3 w-3 text-white" />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Status indicators */}
                        <div className="absolute top-2 left-2 flex flex-col gap-1">
                            {/* Live/Offline indicator */}
                            {hasImageError ? (
                                <div className="bg-red-600 text-white px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                                    <WifiOff className="h-3 w-3" />
                                    OFFLINE
                                </div>
                            ) : (
                                <div className="bg-red-500 text-white px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                    LIVE
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
                    {/* Header Row */}
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

                        {/* <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                haptics.tap()
                onToggleFavorite(camera.id)
              }}
              className="flex-shrink-0 p-1 h-8 w-8"
            >
              <FavoriteIcon size="sm" active={isFavorite} />
            </Button> */}
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