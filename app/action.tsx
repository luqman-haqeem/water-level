"use server";

import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { encodedRedirect } from "@/utils/utils";

export const signOutAction = async () => {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return redirect("/");
};
export const getUserDetails = async () => {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    return user;
};
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

export const getFavoriteList = async (type: "station" | "camera") => {
    const supabase = await createClient();
    const user = await getUserDetails();

    const tableName = type === "station" ? "favorite_stations" : "favorite_cameras";

    const columnName = type === "station" ? "station_id" : "camera_id";

    const { data: favorites, error } = await supabase
        .from(tableName)
        .select(columnName)
        .eq("user_id", user?.id);

    return favorites ?? [];
}

export const addFavorite = async (type: "station" | "camera", value: string) => {
    const supabase = await createClient();
    const user = await getUserDetails();

    const tableName = type === "station" ? "favorite_stations" : "favorite_cameras";

    const columnName = type === "station" ? "station_id" : "camera_id";

    const { error } = await supabase.from(tableName).insert([
        {
            user_id: user?.id,
            [columnName]: value,
        },
    ]);
    if (error) {
        console.error("Error adding favorite station:", error);
        return;
    }
};
export const removeFavorite = async (type: "station" | "camera", value: string) => {
    const supabase = await createClient();
    const user = await getUserDetails();

    const tableName = type === "station" ? "favorite_stations" : "favorite_cameras";

    const columnName = type === "station" ? "station_id" : "camera_id";

    if (user) {
        const { error } = await supabase
            .from(tableName)
            .delete()
            .eq("user_id", user?.id)
            .eq(columnName, value);
        if (error) {
            console.error("Error removing favorite :", error);
            return;
        }

    }
}