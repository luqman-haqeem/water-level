import { getStationList } from "@/app/action";
import StationsComponent from "./StationsComponent";

export default async function StationsPage() {
    const stations = await getStationList();
    return <StationsComponent initialStations={stations} />;
}