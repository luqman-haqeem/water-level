import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import axios from 'axios';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id


    const imageUrl = `http://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image/${id}.jpg`;

    console.log(`Fetching image for camera ID: ${id}`);
    console.log(`Generated URL: ${imageUrl}`);

    try {
        const res = await fetch(imageUrl);
        const blob = await res.arrayBuffer();

        return new NextResponse(blob, {
            status: 200, headers: {
                'Cache-Control': `public, max-age=300`,
                'Content-Type': 'image/jpeg'
            }
        });
    } catch (error) {
        console.error('Error fetching image:', error);
    }


}
