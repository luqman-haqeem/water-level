import { useState } from "react";
import { Button } from "@/components/ui/button";
import useUserStore from "@/lib/store";
import { Star } from "lucide-react";
import LoginModal from "@/components/LoginModel";

export default function FavoriteButton({ type, id }: { type: 'camera' | 'station', id: number }) {
    const { isLoggedIn, favCameras, favStations, addFavorite, removeFavorite } = useUserStore();
    const [showLoginModal, setShowLoginModal] = useState(false)
    const favList = type == 'station' ? favStations : favCameras
    const toggleFavorite = (type: 'camera' | 'station', id: number) => {

        if (!isLoggedIn) {
            setShowLoginModal(true)
            return
        }
        if (favList.includes(id.toString())) {
            removeFavorite(id.toString(), type);
        } else {
            addFavorite(id.toString(), type);
        }
    }

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                    e.stopPropagation()
                    toggleFavorite(type, id)
                }}
            >
                <Star className={`h-4 w-4 ${favList.includes(id.toString()) ? 'fill-yellow-400' : ''}`} />
            </Button>

            {/* Login Modal */}
            <LoginModal
                open={showLoginModal}
                onOpenChange={setShowLoginModal}
            /></>
    )
}