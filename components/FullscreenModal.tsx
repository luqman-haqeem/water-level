import React, { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Image from 'next/image';
import { ZoomIn, ZoomOut, RotateCw, Download, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptics } from '@/utils/haptics';
import useSwipeGestures from '@/hooks/useSwipeGestures';

interface FullscreenModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    imageSrc: string;
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    onSwipeUp?: () => void;
    cameraName?: string;
    showControls?: boolean;
}

export default function FullscreenModal({ 
    open, 
    onOpenChange, 
    imageSrc, 
    onSwipeLeft, 
    onSwipeRight, 
    onSwipeUp,
    cameraName = "Camera Feed",
    showControls = true
}: FullscreenModalProps) {
    const [zoom, setZoom] = useState(1)
    const [position, setPosition] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
    const [isLoading, setIsLoading] = useState(true)
    const [showHints, setShowHints] = useState(true)
    const imageRef = useRef<HTMLImageElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Reset state when modal opens/closes
    const handleOpenChange = useCallback((newOpen: boolean) => {
        if (!newOpen) {
            setZoom(1)
            setPosition({ x: 0, y: 0 })
            setIsDragging(false)
            setIsLoading(true)
            setShowHints(true)
        }
        onOpenChange(newOpen)
    }, [onOpenChange])

    // Zoom controls
    const handleZoomIn = () => {
        haptics.tap()
        setZoom(prev => Math.min(prev + 0.5, 3))
        setShowHints(false)
    }

    const handleZoomOut = () => {
        haptics.tap()
        setZoom(prev => Math.max(prev - 0.5, 1))
        if (zoom <= 1.5) {
            setPosition({ x: 0, y: 0 })
        }
    }

    const handleZoomReset = () => {
        haptics.tap()
        setZoom(1)
        setPosition({ x: 0, y: 0 })
        setShowHints(true)
    }

    // Touch/mouse pan handling
    const handleMouseDown = (e: React.MouseEvent) => {
        if (zoom <= 1) return
        setIsDragging(true)
        setDragStart({ 
            x: e.clientX - position.x, 
            y: e.clientY - position.y 
        })
        setShowHints(false)
    }

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || zoom <= 1) return
        
        const newX = e.clientX - dragStart.x
        const newY = e.clientY - dragStart.y
        
        // Constrain position to image boundaries
        const maxX = ((zoom - 1) * 200)
        const maxY = ((zoom - 1) * 150)
        
        setPosition({
            x: Math.max(-maxX, Math.min(maxX, newX)),
            y: Math.max(-maxY, Math.min(maxY, newY))
        })
    }

    const handleMouseUp = () => {
        setIsDragging(false)
    }

    // Download functionality
    const handleDownload = async () => {
        try {
            haptics.tap()
            const response = await fetch(imageSrc)
            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `${cameraName.replace(/\s+/g, '_')}_${Date.now()}.jpg`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            window.URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Download failed:', error)
        }
    }

    // Refresh image
    const handleRefresh = () => {
        haptics.tap()
        setIsLoading(true)
        if (imageRef.current) {
            imageRef.current.src = `${imageSrc}?t=${Date.now()}`
        }
    }

    // Add swipe gesture support
    const swipeRef = useSwipeGestures({
        onSwipeLeft: zoom <= 1 ? onSwipeLeft : undefined,
        onSwipeRight: zoom <= 1 ? onSwipeRight : undefined,
        onSwipeUp: () => {
            onSwipeUp?.() || handleOpenChange(false)
        },
        threshold: zoom <= 1 ? 60 : 100
    })

    // Hide hints after 3 seconds
    React.useEffect(() => {
        if (showHints) {
            const timer = setTimeout(() => setShowHints(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [showHints])

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-screen-xl w-full h-full p-0 theme-transition-colors">
                <DialogHeader className="absolute top-0 left-0 right-0 z-10 bg-black/50 backdrop-blur-sm p-4">
                    <DialogTitle className="text-white text-lg font-medium truncate">
                        {cameraName}
                    </DialogTitle>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenChange(false)}
                        className="absolute right-2 top-2 text-white hover:bg-white/10"
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </DialogHeader>

                <div 
                    ref={swipeRef}
                    className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <div 
                        className="relative transition-transform duration-200 ease-out"
                        style={{
                            transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                            cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
                        }}
                    >
                        <Image
                            ref={imageRef}
                            key={imageSrc}
                            src={imageSrc}
                            width={1920}
                            height={1080}
                            alt={`${cameraName} feed`}
                            className="max-w-full max-h-screen object-contain"
                            onError={(e) => {
                                e.currentTarget.src = '/nocctv.png'
                                setIsLoading(false)
                            }}
                            onLoad={() => setIsLoading(false)}
                            blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAUAB4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAxQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0ykZgoyxAHqaomO5xhVkAOM7pMnPOT16dO/4UrxXDqm4OWwhyHAAIxnI9aALwIIyDkGiqaxTqA5Z92TnLZGNvp9aLKTezkFyoVfvPu55z/SgC5RRRQAUUUUAf/9k="
                            placeholder="blur"
                            unoptimized
                        />
                    </div>

                    {/* Loading indicator */}
                    {isLoading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                        </div>
                    )}

                    {/* Swipe hints overlay */}
                    {showHints && zoom <= 1 && (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-between px-4 transition-opacity duration-500">
                            <div className="bg-black/30 backdrop-blur-sm rounded px-2 py-1 text-white text-xs">
                                ← Prev
                            </div>
                            <div className="bg-black/30 backdrop-blur-sm rounded px-2 py-1 text-white text-xs text-center">
                                ↑ Close
                            </div>
                            <div className="bg-black/30 backdrop-blur-sm rounded px-2 py-1 text-white text-xs">
                                Next →
                            </div>
                        </div>
                    )}

                    {/* Zoom indicator */}
                    {zoom > 1 && (
                        <div className="absolute top-20 right-4 bg-black/50 backdrop-blur-sm rounded px-2 py-1 text-white text-xs">
                            {zoom.toFixed(1)}x
                        </div>
                    )}
                </div>

                {/* Control bar */}
                {showControls && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm p-4">
                        <div className="flex items-center justify-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleZoomOut}
                                disabled={zoom <= 1}
                                className="text-white hover:bg-white/10 disabled:opacity-50"
                            >
                                <ZoomOut className="h-5 w-5" />
                            </Button>
                            
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleZoomReset}
                                className="text-white hover:bg-white/10"
                            >
                                <span className="text-xs font-medium">1:1</span>
                            </Button>
                            
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleZoomIn}
                                disabled={zoom >= 3}
                                className="text-white hover:bg-white/10 disabled:opacity-50"
                            >
                                <ZoomIn className="h-5 w-5" />
                            </Button>
                            
                            <div className="w-px h-6 bg-white/20 mx-2" />
                            
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleRefresh}
                                className="text-white hover:bg-white/10"
                            >
                                <RotateCw className="h-5 w-5" />
                            </Button>
                            
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleDownload}
                                className="text-white hover:bg-white/10"
                            >
                                <Download className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}