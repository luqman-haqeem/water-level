import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useTheme } from "next-themes"
import { Star } from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@supabase/supabase-js'


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
const supabase = createClient(supabaseUrl, supabaseKey)


interface ComponentProps {

    cameras: {
        id: number;
        camera_name: string;
        img_url: string;
        JPS_camera_id: string;

        districts: {
            name: string;
        };
    }[];
}


export async function getStaticProps() {

    let { data: cameras, error: camerasError } = await supabase
        .from('cameras')
        .select('id,camera_name,img_url,JPS_camera_id,districts(name)')
        .eq('is_enabled', 'TRUE')
    // console.log(cameras);
    if (camerasError) {
        console.error('Error fetching camera:', camerasError.message)
        cameras = []
    }

    return {
        props: {
            cameras
        }
    }
}

export default function Component({ cameras }: ComponentProps) {

    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [showLoginModal, setShowLoginModal] = useState(false)

    const [favorites, setFavorites] = useState<{ stations: number[], cameras: number[] }>({ stations: [], cameras: [] })


    const toggleFavorite = (type: 'station' | 'camera', id: number) => {
        if (!isLoggedIn) {
            setShowLoginModal(true)
            return
        }
        setFavorites(prev => {
            const key = type === 'station' ? 'stations' : 'cameras'
            const newFavorites = prev[key].includes(id)
                ? prev[key].filter(fav => fav !== id)
                : [...prev[key], id]
            return { ...prev, [key]: newFavorites }
        })
    }


    return (
        <>

            <div className="flex flex-col h-screen bg-background">
                {(
                    <div className="flex-1 p-4 overflow-auto">
                        <h2 className="text-2xl font-bold mb-4">Camera Feeds</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {cameras.map((camera) => (
                                <Card key={camera.id}>
                                    <CardHeader className="p-4">
                                        <div className="flex justify-between items-center">
                                            <CardTitle className="text-sm font-medium">{camera.camera_name}</CardTitle>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => toggleFavorite('camera', camera.id)}
                                            >
                                                <Star className={`h-4 w-4 ${favorites.cameras.includes(camera.id) ? 'fill-yellow-400' : ''}`} />
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{camera.districts.name}</p>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                        <Image src={`/api/proxy-image/${camera?.JPS_camera_id}`}
                                            width={600}
                                            height={330}
                                            alt={`${camera.camera_name} feed`}
                                            className="w-full rounded-md"
                                            onError={(e) => e.currentTarget.src = '/nocctv.png'}
                                            blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAUAB4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0ykZgoyxAHqaomO5xhVkAOM7pMnPOT16dO/4UrxXDqm4OWwhyHAAIxnI9aALwIIyDkGiqaxTqA5Z92TnLZGNvp9aLKTezkFyoVfvPu55z/SgC5RRRQAUUUUAf/9k="
                                            placeholder="blur"
                                            unoptimized></Image>


                                        {/* <img src={`/api/proxy-image/${camera?.JPS_camera_id}`} width={500}
                                                height={200} alt={`${camera.camera_name} feed`} className="w-full rounded-md" /> */}

                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}
            </div >
        </>

    )
}