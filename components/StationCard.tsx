import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from '@/lib/utils'
import formatTimestamp from '@/utils/timeUtils'
import AlertLevelBadge from "@/components/AlertLevelBadge"
import WaterLevelGauge from "@/components/WaterLevelGauge"
import { haptics } from '@/utils/haptics'
import {
    WaterIcon,
    LocationIcon,
    TimeIcon,
    CameraIcon,
    FavoriteIcon
} from '@/components/icons/IconLibrary'
import { Id } from "../convex/_generated/dataModel"
import MicroTrendChart from './MicroTrendChart'

interface Station {
    id: Id<"stations"> | number
    station_name: string
    districts: {
        name: string
    }
    current_levels: {
        current_level: number
        updated_at: string | number | undefined
        alert_level: string
    } | null
    cameras: {
        img_url: string | undefined
        jps_camera_id: string
        is_enabled: boolean
    } | null
    normal_water_level: number
    alert_water_level: number
    warning_water_level: number
    danger_water_level: number
    station_status: boolean
}

interface StationCardProps {
    station: Station
    isSelected: boolean
    isFavorite: boolean
    onSelect: (station: Station) => void
    onToggleFavorite: (id: Id<"stations"> | number) => void
    className?: string
    showGauge?: boolean
    compact?: boolean
}

export default function StationCard({
    station,
    isSelected,
    isFavorite,
    onSelect,
    onToggleFavorite,
    className,
    showGauge = false,
    compact = false
}: StationCardProps) {
    const getStatusColor = (alertLevel: string) => {
        const level = parseInt(alertLevel)
        switch (level) {
            case 0: return 'text-success'
            case 1: return 'text-alert'
            case 2: return 'text-warning'
            case 3: return 'text-destructive'
            default: return 'text-muted-foreground'
        }
    }

    const getStatusIcon = (alertLevel: string) => {
        const level = parseInt(alertLevel)
        switch (level) {
            case 0: return '🟢'
            case 1: return '🟠'
            case 2: return '🟡'
            case 3: return '🔴'
            default: return '⚪'
        }
    }

    return (
        <Card
            className={cn(
                "mb-3 cursor-pointer transition-all duration-200 hover:shadow-md theme-transition-colors",
                "border border-border/50 hover:border-primary/50",
                "active:scale-[0.98] active:border-primary",
                isSelected && "border-primary shadow-md ring-2 ring-primary/20 bg-primary/5",
                className
            )}
            onClick={() => {
                haptics.select()
                onSelect(station)
            }}
        >
            <CardContent className="p-4 space-y-3">
                {/* Header Row */}
                <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <LocationIcon size="sm" className="flex-shrink-0" />
                            <h3 className="text-station-name truncate">{station.station_name}</h3>
                            {station.cameras && (
                                <CameraIcon size="sm" className="text-muted-foreground flex-shrink-0" />
                            )}
                        </div>
                        <p className="text-metadata truncate">{station.districts.name}</p>
                    </div>

                    {/* <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation()
                            haptics.tap()
                            onToggleFavorite(station.id)
                        }}
                        className="flex-shrink-0 p-1 h-8 w-8"
                    >
                        <FavoriteIcon size="sm" active={isFavorite} />
                    </Button> */}
                </div>

                {/* Data Row with Mini Chart */}
                <div className="flex items-center justify-between">
                    {/* Left: Water Level */}
                    <div className="flex items-center gap-2">
                        <WaterIcon size="sm" />
                        <div>
                            <span className="text-water-level">
                                {station.current_levels?.current_level || '—'}<span className="text-body-small font-normal">m</span>
                            </span>
                        </div>
                    </div>

                    {/* Center: Mini Trend Chart */}
                    <div className="flex-1 flex justify-center px-4">
                        <MicroTrendChart
                            stationId={station.id.toString()}
                            currentLevel={station.current_levels?.current_level || 0}
                            alertLevel={Number(station.current_levels?.alert_level) || 0}
                        />
                    </div>

                    {/* Right: Current Level & Status */}
                    <div className="text-right">
                        <div className="text-lg font-semibold">
                            {station.current_levels?.current_level || '—'} m
                        </div>
                        <div className="flex items-center gap-1 justify-end">
                            <AlertLevelBadge
                                alert_level={Number(station.current_levels?.alert_level) || 0}
                                className="text-xs"
                            />
                        </div>
                    </div>
                </div>

                {/* Bottom Row: Last Updated */}
                <div className="flex items-center justify-center gap-1 text-metadata pt-1">
                    <TimeIcon size="xs" />
                    <span>
                        {station.current_levels?.updated_at
                            ? formatTimestamp(station.current_levels.updated_at.toString())
                            : 'Unknown'}
                    </span>
                </div>

                {/* Visual Water Level Gauge */}
                {showGauge && station.current_levels && (
                    <div className="pt-2 border-t border-border/50">
                        <WaterLevelGauge
                            currentLevel={station.current_levels.current_level}
                            levels={{
                                normal: station.normal_water_level,
                                alert: station.alert_water_level,
                                warning: station.warning_water_level,
                                danger: station.danger_water_level
                            }}
                            size="sm"
                            orientation="horizontal"
                            showLabels={false}
                            showCurrentValue={false}
                            className="mt-2"
                        />
                    </div>
                )}

                {/* Station Status Indicator */}
                {!station.station_status && (
                    <div className="flex items-center gap-1 text-caption text-destructive">
                        <div className="w-2 h-2 bg-destructive rounded-full"></div>
                        <span>Station Offline</span>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}