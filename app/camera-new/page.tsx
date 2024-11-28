import { getCamerasList } from "@/app/action";
import CameraComponent from "./CameraComponent";

export default async function CamerasPage() {
    const cameras = await getCamerasList();
    return <CameraComponent initialCamera={cameras} />;
}