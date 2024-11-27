"use server";

import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { encodedRedirect } from "@/utils/utils";

export const getStationList = async () => {

    const supabase = await createClient();

    let { data: stations, error: stationsError } = await supabase
        .from('stations')
        .select(`
            id,
            station_name,
            districts(
            name),
            current_levels (
            current_level, updated_at,alert_level),
            cameras (
                jps_camera_id,
                img_url,
                is_enabled
            ),
            normal_water_level,
            alert_water_level,
            warning_water_level,
            danger_water_level,
            station_status            
            
            `)
    if (stationsError) {
        console.error('Error fetching stations:', stationsError.message)
        stations = []
    }

    return stations;
};



export const getCamerasList = async () => {

    const supabase = await createClient();

    let { data: cameras, error: camerasError } = await supabase
        .from('cameras')
        .select('id,camera_name,img_url,jps_camera_id,districts(name)')
        .eq('is_enabled', 'TRUE')
    if (camerasError) {
        console.error('Error fetching camera:', camerasError.message)
        cameras = []
    }
    return cameras
};