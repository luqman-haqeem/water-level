import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import FullscreenModal from "@/components/FullscreenModal";
import CameraCard from "@/components/CameraCard";
import { CameraSkeleton } from "@/components/SkeletonCard";
import { useQueryClient } from "@tanstack/react-query";
import { useCameras } from "@/hooks/useCameras";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";

export function CamerasRoute() {
    // Search state
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

    // Fetch data with TanStack Query
    const queryClientInstance = useQueryClient();
    const { data: cameras, isLoading: isLoadingCameras } = useCameras();
    const camerasData = useMemo(() => cameras || [], [cameras]);

    const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
    const [fullscreenImageSrc, setFullscreenImageSrc] = useState("");

    // Debounce search term
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Apply search filter
    const filteredCameras = useMemo(() => {
        let result = camerasData;

        if (debouncedSearchTerm.trim()) {
            const searchLower = debouncedSearchTerm.toLowerCase();
            result = result.filter((camera) => {
                const cameraNameLower = camera.camera_name.toLowerCase();
                const districtNameLower =
                    camera.districts.name.toLowerCase();
                return (
                    cameraNameLower.includes(searchLower) ||
                    districtNameLower.includes(searchLower)
                );
            });
        }

        return result;
    }, [camerasData, debouncedSearchTerm]);

    const openFullscreen = (src: string) => {
        setFullscreenImageSrc(src);
        setIsFullscreenOpen(true);
    };

    const closeFullscreen = () => {
        setIsFullscreenOpen(false);
        setFullscreenImageSrc("");
    };

    // Pull-to-refresh
    const pullToRefresh = usePullToRefresh({
        onRefresh: async () => {
            try {
                await queryClientInstance.invalidateQueries({
                    queryKey: ["cameras"],
                });
            } catch (error) {
                console.error("Failed to refresh cameras data:", error);
            }
        },
        threshold: 80,
    });

    // Camera navigation for fullscreen mode
    const getCurrentCameraIndex = () => {
        return filteredCameras.findIndex(
            (camera) =>
                `/api/proxy-image/${camera.jps_camera_id}` ===
                fullscreenImageSrc
        );
    };

    const getCurrentCamera = () => {
        const index = getCurrentCameraIndex();
        return index >= 0 ? filteredCameras[index] : null;
    };

    const navigateToCamera = (direction: "next" | "prev") => {
        const currentIndex = getCurrentCameraIndex();
        if (currentIndex === -1) return;

        let newIndex: number;
        if (direction === "next") {
            newIndex =
                currentIndex + 1 >= filteredCameras.length
                    ? 0
                    : currentIndex + 1;
        } else {
            newIndex =
                currentIndex - 1 < 0
                    ? filteredCameras.length - 1
                    : currentIndex - 1;
        }

        const newCamera = filteredCameras[newIndex];
        if (newCamera) {
            setFullscreenImageSrc(
                `/api/proxy-image/${newCamera.jps_camera_id}`
            );
        }
    };

    return (
        <>
            <div className="flex-1 flex flex-col bg-background">
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
                            Array.from({ length: 6 }).map((_, index) => (
                                <CameraSkeleton
                                    key={`skeleton-${index}`}
                                />
                            ))
                        ) : filteredCameras.length > 0 ? (
                            filteredCameras.map((camera) => (
                                <CameraCard
                                    key={camera.id.toString()}
                                    camera={camera}
                                    onImageClick={(imageUrl) =>
                                        openFullscreen(imageUrl)
                                    }
                                />
                            ))
                        ) : (
                            <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                                {debouncedSearchTerm.trim() ? (
                                    <>
                                        <p className="text-body-large text-muted-foreground mb-2">
                                            No cameras found
                                        </p>
                                        <p className="text-body text-muted-foreground">
                                            Try adjusting your search terms
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-body-large text-muted-foreground mb-2">
                                            No cameras available
                                        </p>
                                        <p className="text-body text-muted-foreground">
                                            Camera feeds will appear here
                                            when available
                                        </p>
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
                        cameraName={
                            getCurrentCamera()?.camera_name ||
                            "Camera Feed"
                        }
                        onSwipeLeft={() => navigateToCamera("next")}
                        onSwipeRight={() => navigateToCamera("prev")}
                        onSwipeUp={() => closeFullscreen()}
                        showControls={true}
                    />
                </div>
            </div>
        </>
    );
}
