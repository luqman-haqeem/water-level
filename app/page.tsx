import { getFavoriteList, getStationList } from "@/app/action";
import StationsComponent from "./StationsComponent";
import { createClient } from "@/utils/supabase/server";

export default async function StationsPage() {
    const stations = await getStationList();
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (user) {
        const favorites = await getFavoriteList("station");

        if (favorites) {
            const favoriteStations = favorites.map((favorite) => favorite.station_id);
            stations?.forEach((station) => {
                station.isFavorite = favoriteStations.includes(station.id);
            });
        }
    }


    return <StationsComponent initialStations={stations} />;
}