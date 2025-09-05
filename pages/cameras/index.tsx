import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Head from 'next/head';
import { Star, Expand, RotateCw, Ellipsis } from 'lucide-react'
import Image from 'next/image'
import LoginModal from '@/components/LoginModel';
import FullscreenModal from '@/components/FullscreenModal';
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useUserStore } from '../../lib/convexStore';
import { useTheme } from "next-themes"

import PullToRefresh from 'pulltorefreshjs';
import ReactDOMServer from 'react-dom/server';
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

    // Fetch data from Convex
    const cameras = useQuery(api.cameras.getCamerasWithDetails) || [];
    const { isLoggedIn, favCameras, addFavCamera, removeFavCamera } = useUserStore();
    const [showLoginModal, setShowLoginModal] = useState(false)
    const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)
    const [fullscreenImageSrc, setFullscreenImageSrc] = useState("")
    const { theme, setTheme } = useTheme()

    const openFullscreen = (src: string) => {
        setFullscreenImageSrc(src)
        setIsFullscreenOpen(true)
    }

    const closeFullscreen = () => {
        setIsFullscreenOpen(false)
        setFullscreenImageSrc("")
    }
    useEffect(() => {

        PullToRefresh.init({
            mainElement: 'main',
            onRefresh() {
                // Custom refresh logic
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve();
                        window.location.reload();
                    }, 1000);
                });
            },
            distThreshold: 60,
            distMax: 80,
            distReload: 50,
            distIgnore: 0,
            // iconArrow: '&#8675;',
            iconArrow: ReactDOMServer.renderToString(
                <div className={`flex justify-center items-center ${theme === 'dark' ? 'text-white' : 'text-stone-400'}`}>
                    <RotateCw />
                </div>
            ),
            iconRefreshing: ReactDOMServer.renderToString(
                <div className={`flex justify-center items-center pt-4 ${theme === 'dark' ? 'text-white' : 'text-stone-400'}`}>
                    <Ellipsis />
                </div>
            ),
            instructionsPullToRefresh: ReactDOMServer.renderToString(
                <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    Pull down to refresh
                </div>
            ),
            instructionsReleaseToRefresh: ReactDOMServer.renderToString(
                <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    Release to refresh
                </div>
            ),
            instructionsRefreshing: ReactDOMServer.renderToString(
                <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    Refreshing
                </div>
            ),
            refreshTimeout: 500,
            shouldPullToRefresh: () => !window.scrollY
        });
        return () => PullToRefresh.destroyAll();
    }, []);

    const toggleFavorite = (type: 'camera', id: Id<"cameras"> | number) => {
        if (!isLoggedIn) {
            setShowLoginModal(true)
            return
        }
        const idString = id.toString();
        if (favCameras.includes(idString)) {
            removeFavCamera(idString);
        } else {
            addFavCamera(idString);
        }
    }

    return (
        <>
            <Head>
                <title>Cameras - River Water Level</title>
            </Head>
            <div className="flex flex-col h-screen bg-background">
                {(
                    <div className="flex-1 p-4 sm:p-6 overflow-auto">
                        <h2 className="text-2xl sm:text-3xl font-bold mb-6">Camera Feeds</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                            {cameras.map((camera) => (
                                <Card key={camera.id}>
                                    <CardHeader className="p-4">
                                        <div className="flex justify-between items-center">
                                            <CardTitle className="text-sm font-medium">{camera.camera_name}</CardTitle>
                                            <Button
                                                variant="ghost"
                                                size="touch"
                                                onClick={() => toggleFavorite('camera', camera.id)}
                                                className="shrink-0"
                                            >
                                                <Star className={`w-5 h-5 transition-all duration-200 ${
                                                    favCameras.includes(camera.id.toString()) 
                                                        ? 'fill-yellow-400 text-yellow-400' 
                                                        : 'text-gray-400 hover:text-yellow-400'
                                                }`} />
                                                <span className="sr-only">
                                                    {favCameras.includes(camera.id.toString()) ? 'Remove from' : 'Add to'} favorites
                                                </span>
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{camera.districts.name}</p>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                        <div onClick={() =>
                                            // openFullscreen(`${bucketUrl}/images/${camera?.jps_camera_id}.jpg`)}
                                            openFullscreen(`/api/proxy-image/${camera?.jps_camera_id}`)}
                                            className="relative cursor-pointer">
                                            <Image
                                                // src={`${bucketUrl}/images/${camera?.jps_camera_id}.jpg`}
                                                src={`/api/proxy-image/${camera?.jps_camera_id}`}
                                                width={600}
                                                height={330}
                                                alt={`${camera.camera_name} feed`}
                                                className="w-full rounded-md"
                                                onError={(e) => e.currentTarget.src = '/nocctv.png'}
                                                blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAUAB4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0ykZgoyxAHqaomO5xhVkAOM7pMnPOT16dO/4UrxXDqm4OWwhyHAAIxnI9aALwIIyDkGiqaxTqA5Z92TnLZGNvp9aLKTezkFyoVfvPu55z/SgC5RRRQAUUUUAf/9k="
                                                unoptimized
                                                placeholder="blur"
                                            ></Image>
                                            <div className="absolute top-0 right-0 m-2">
                                                <Expand className="h-6 w-6 text-white bg-black bg-opacity-50 rounded-full p-1" />
                                            </div>
                                        </div>


                                        {/* <img src={`/api/proxy-image/${camera?.jps_camera_id}`} width={500}
                                                height={200} alt={`${camera.camera_name} feed`} className="w-full rounded-md" /> */}

                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                        <div className="pb-20"></div>
                        <FullscreenModal open={isFullscreenOpen} onOpenChange={closeFullscreen} imageSrc={fullscreenImageSrc}></FullscreenModal>


                        {/* Login Modal */}
                        <LoginModal
                            open={showLoginModal}
                            onOpenChange={setShowLoginModal}
                        />
                    </div>
                )}
            </div >
        </>

    )
}