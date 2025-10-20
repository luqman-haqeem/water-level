import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { useRouter } from 'next/router'
import { cn } from '@/lib/utils'
import { haptics } from '@/utils/haptics'
import { 
  WaterIcon, 
  CameraIcon, 
  FavoriteIcon, 
  FilterIcon
} from '@/components/icons/IconLibrary'

interface BottomNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  onFavoritesToggle?: () => void
  onFilterToggle?: () => void
  showFavorites?: boolean
  showFilters?: boolean
  favoritesActive?: boolean
}

export default function BottomNavigation({
  activeTab,
  onTabChange,
  onFavoritesToggle,
  onFilterToggle,
  showFavorites = true,
  showFilters = true,
  favoritesActive = false
}: BottomNavigationProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)

  // Auto-hide bottom nav on scroll
  useEffect(() => {
    const controlNavbar = () => {
      if (typeof window !== 'undefined') {
        const currentScrollY = window.scrollY
        
        if (currentScrollY < lastScrollY || currentScrollY < 100) {
          setIsVisible(true)
        } else if (currentScrollY > lastScrollY && currentScrollY > 100) {
          setIsVisible(false)
        }

        setLastScrollY(currentScrollY)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', controlNavbar)
      
      return () => {
        window.removeEventListener('scroll', controlNavbar)
      }
    }
  }, [lastScrollY])

  return (
    <nav 
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out theme-transition-colors",
        "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        "border-t border-border/40",
        "pb-safe-bottom",
        isVisible ? "translate-y-0" : "translate-y-full"
      )}
    >
      <div className="flex items-center justify-around px-2 py-2">
        {/* Main Navigation Tabs */}
        <Button
          variant={activeTab === 'stations' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => {
            if (activeTab !== 'stations') {
              haptics.select()
            }
            onTabChange('stations')
          }}
          className="flex-col h-12 min-w-[60px] px-2 gap-1"
        >
          <WaterIcon size="md" />
          <span className="text-caption">Stations</span>
        </Button>

        <Button
          variant={activeTab === 'cameras' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => {
            if (activeTab !== 'cameras') {
              haptics.select()
            }
            onTabChange('cameras')
          }}
          className="flex-col h-12 min-w-[60px] px-2 gap-1"
        >
          <CameraIcon size="md" />
          <span className="text-caption">Cameras</span>
        </Button>

        {/* Quick Action Buttons */}
        {showFavorites && (
          <Button
            variant={favoritesActive ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              haptics.tap()
              onFavoritesToggle?.()
            }}
            className="flex-col h-12 min-w-[60px] px-2 gap-1"
          >
            <FavoriteIcon size="md" />
            <span className="text-caption">Favorites</span>
          </Button>
        )}

        {showFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              haptics.tap()
              onFilterToggle?.()
            }}
            className="flex-col h-12 min-w-[60px] px-2 gap-1"
          >
            <FilterIcon size="md" />
            <span className="text-caption">Filter</span>
          </Button>
        )}

      </div>
    </nav>
  )
}