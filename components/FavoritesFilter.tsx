import { Button } from "@/components/ui/button";
import { FavoriteIcon } from '@/components/icons/IconLibrary';
import { useFilter } from '../lib/FilterContext';
import { haptics } from '@/utils/haptics';

interface FavoritesFilterProps {
  isLoggedIn: boolean;
}

export default function FavoritesFilter({ isLoggedIn }: FavoritesFilterProps) {
  const { showFavoritesOnly, toggleFavorites } = useFilter();

  // Only show for logged-in users
  if (!isLoggedIn) {
    return null;
  }

  return (
    <Button
      variant={showFavoritesOnly ? "default" : "outline"}
      size="sm"
      onClick={() => {
        if (typeof window !== 'undefined') {
          haptics.tap();
        }
        toggleFavorites();
      }}
      className="flex items-center gap-2 h-10"
    >
      <FavoriteIcon 
        size="sm" 
        className={showFavoritesOnly ? "text-primary-foreground" : "text-primary"} 
      />
      <span className="text-sm font-medium">
        {showFavoritesOnly ? "Favorites" : "Favorites"}
      </span>
    </Button>
  );
}