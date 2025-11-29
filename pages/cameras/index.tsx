import { useState, useEffect, useMemo } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import Head from 'next/head';
import { Star, Expand, RotateCw, Ellipsis } from 'lucide-react'
import useSwipeGestures from '@/hooks/useSwipeGestures'
import Image from 'next/image'
// import LoginModal from '@/components/LoginModel';
import FullscreenModal from '@/components/FullscreenModal';
import CameraCard from '@/components/CameraCard';
import { CameraSkeleton } from '@/components/SkeletonCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useQuery, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useUserStore } from '../../lib/convexStore';
import { useTheme } from "next-themes"
import { useFilter } from '../../lib/FilterContext';
import FavoritesFilter from '@/components/FavoritesFilter';

import usePullToRefresh from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
const bucketUrl = 'https://hnqhytdyrehyflbymaej.supabase.co/storage/v1/object/public/cameras';

import { Id } from "../../convex/_generated/dataModel";

interface ComponentProps {
    cameras: {
        id: Id<"cameras"> | number;
        camera_name: string;
        img_url: string | undefined;
        jps_camera_id: string;
        districts: {
            name: string;
        };
    }[];
}

// Note: With Convex, we'll fetch data client-side using useQuery
export async function getStaticProps() {
    return {
        props: {
            cameras: [] // Empty initial data, will be loaded by Convex
        },
        revalidate: 180 // 3 minutes
    }
}

export default function Component({ cameras: initialCameras }: ComponentProps) {

    // Search state
    const [searchTerm, setSearchTerm] = useState("")
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")

    // Fetch data from Convex
    const convex = useConvex();
    const cameras = useQuery(api.cameras.getCamerasWithDetails);
    const isLoadingCameras = cameras === undefined;
    const camerasData = useMemo(() => cameras || [], [cameras]);
    // const { isLoggedIn, favCameras, addFavCamera, removeFavCamera } = useUserStore();
    const isLoggedIn = false; // Commented out auth
    const favCameras = useMemo(() => [] as string[], []); // Commented out favorites
    // const { showFavoritesOnly, toggleFavorites } = useFilter();
    const showFavoritesOnly = false; // Commented out favorites filter
    // const [showLoginModal, setShowLoginModal] = useState(false)
    const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)
    const [fullscreenImageSrc, setFullscreenImageSrc] = useState("")
    const { theme, setTheme } = useTheme()

    // Debounce search term for better performance
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm)
        }, 300) // 300ms debounce

        return () => clearTimeout(timer)
    }, [searchTerm])

    // Apply search and favorites filter
    const filteredCameras = useMemo(() => {
        let cameras = camerasData;

        // Apply search filter using debounced search term
        if (debouncedSearchTerm.trim()) {
            const searchLower = debouncedSearchTerm.toLowerCase()
            cameras = cameras.filter(camera => {
                // Cache the lowercase versions to avoid repeated toLowerCase calls
                const cameraNameLower = camera.camera_name.toLowerCase()
                const districtNameLower = camera.districts.name.toLowerCase()
                return cameraNameLower.includes(searchLower) || districtNameLower.includes(searchLower)
            })
        }

        // Apply favorites filter if enabled
        if (showFavoritesOnly && isLoggedIn) {
            cameras = cameras.filter(camera => favCameras.includes(camera.id.toString()));
        }

        return cameras;
    }, [camerasData, debouncedSearchTerm, showFavoritesOnly, isLoggedIn, favCameras]);

    const openFullscreen = (src: string) => {
        setFullscreenImageSrc(src)
        setIsFullscreenOpen(true)
    }

    const closeFullscreen = () => {
        setIsFullscreenOpen(false)
        setFullscreenImageSrc("")
    }
    // Pull-to-refresh functionality
    const pullToRefresh = usePullToRefresh({
        onRefresh: async () => {
            try {
                // Invalidate and refetch Convex data
                await convex.query(api.cameras.getCamerasWithDetails);
                // Small delay for smooth UX
                await new Promise(resolve => setTimeout(resolve, 300))
            } catch (error) {
                console.error('Failed to refresh cameras data:', error)
            }
        },
        threshold: 80
    })

    // const toggleFavorite = (type: 'camera', id: Id<"cameras"> | number) => {
    //     if (!isLoggedIn) {
    //         setShowLoginModal(true)
    //         return
    //     }
    //     const idString = id.toString();
    //     if (favCameras.includes(idString)) {
    //         removeFavCamera(idString);
    //     } else {
    //         addFavCamera(idString);
    //     }
    // }
    const toggleFavorite = (type: 'camera', id: Id<"cameras"> | number) => {
        // Favorites disabled - do nothing
        return;
    };

    // Camera navigation for fullscreen mode
    const getCurrentCameraIndex = () => {
        return filteredCameras.findIndex(camera =>
            `/api/proxy-image/${camera.jps_camera_id}` === fullscreenImageSrc
        )
    }

    const getCurrentCamera = () => {
        const index = getCurrentCameraIndex()
        return index >= 0 ? filteredCameras[index] : null
    }

    const navigateToCamera = (direction: 'next' | 'prev') => {
        const currentIndex = getCurrentCameraIndex()
        if (currentIndex === -1) return

        let newIndex: number
        if (direction === 'next') {
            newIndex = currentIndex + 1 >= filteredCameras.length ? 0 : currentIndex + 1
        } else {
            newIndex = currentIndex - 1 < 0 ? filteredCameras.length - 1 : currentIndex - 1
        }

        const newCamera = filteredCameras[newIndex]
        if (newCamera) {
            setFullscreenImageSrc(`/api/proxy-image/${newCamera.jps_camera_id}`)
        }
    }

    return (
        <>
            <Head>
                <title>Cameras - River Water Level</title>
            </Head>
            <div className="flex-1 flex flex-col bg-background">
                {(
                    <div
                        ref={pullToRefresh.containerRef}
                        className="flex-1 p-4 sm:p-6 overflow-auto relative min-h-0"
                    >
                        <PullToRefreshIndicator
                            isVisible={pullToRefresh.shouldShowIndicator}
                            isRefreshing={pullToRefresh.isRefreshing}
                            progress={pullToRefresh.refreshProgress}
                            yOffset={pullToRefresh.indicatorY}
                        />
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-heading-1">Camera Feeds</h2>
                            <FavoritesFilter isLoggedIn={isLoggedIn} />
                        </div>

                        {/* Search Bar */}
                        <div className="mb-6">
                            <Input
                                placeholder="Search cameras or districts..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="min-h-touch"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                            {isLoadingCameras ? (
                                // Show skeleton loading states
                                Array.from({ length: 6 }).map((_, index) => (
                                    <CameraSkeleton key={`skeleton-${index}`} />
                                ))
                            ) : filteredCameras.length > 0 ? (
                                filteredCameras.map((camera) => (
                                    <CameraCard
                                        key={camera.id}
                                        camera={camera}
                                        isFavorite={favCameras.includes(camera.id.toString())}
                                        onToggleFavorite={(id) => toggleFavorite('camera', id)}
                                        onImageClick={(imageUrl) => openFullscreen(imageUrl)}
                                    />
                                ))
                            ) : (
                                <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                                    {debouncedSearchTerm.trim() ? (
                                        <>
                                            <p className="text-body-large text-muted-foreground mb-2">No cameras found</p>
                                            <p className="text-body text-muted-foreground">Try adjusting your search terms or clear the search</p>
                                        </>
                                    ) : showFavoritesOnly ? (
                                        <>
                                            <p className="text-body-large text-muted-foreground mb-2">No favorite cameras</p>
                                            <p className="text-body text-muted-foreground">Add cameras to favorites to see them here</p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-body-large text-muted-foreground mb-2">No cameras available</p>
                                            <p className="text-body text-muted-foreground">Camera feeds will appear here when available</p>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="pb-20"></div>
                        <FullscreenModal
                            open={isFullscreenOpen}
                            onOpenChange={closeFullscreen}
                            imageSrc={fullscreenImageSrc}
                            cameraName={getCurrentCamera()?.camera_name || "Camera Feed"}
                            onSwipeLeft={() => navigateToCamera('next')}
                            onSwipeRight={() => navigateToCamera('prev')}
                            onSwipeUp={() => closeFullscreen()}
                            showControls={true}
                        />


                        {/* Login Modal - Commented out */}
                        {/* <LoginModal
                            open={showLoginModal}
                            onOpenChange={setShowLoginModal}
                        /> */}
                    </div>
                )}
            </div >
        </>

    )
}