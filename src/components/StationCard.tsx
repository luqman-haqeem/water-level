import { useState } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from '@/lib/utils'
import formatTimestamp, { isStale } from '@/utils/timeUtils'
import { formatDistance } from '@/utils/locationUtils'
import AlertLevelBadge from "@/components/AlertLevelBadge"
import WaterLevelGauge from "@/components/WaterLevelGauge"
import { haptics } from '@/utils/haptics'
import {
    WaterIcon,
    LocationIcon,
    TimeIcon,
    CameraIcon,
    BellIcon,
    BellRingIcon,
} from '@/components/icons/IconLibrary'
import { Id } from "../../convex/_generated/dataModel"
import MicroTrendChart from './MicroTrendChart'
import { useStationSubscription } from '@/hooks/useStationSubscription'
import { useToast } from '@/hooks/use-toast'

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
    onSelect: (station: Station) => void
    className?: string
    showGauge?: boolean
    compact?: boolean
    distance?: number
}

export default function StationCard({
    station,
    isSelected,
    onSelect,
    className,
    showGauge = false,
    compact = false,
    distance
}: StationCardProps) {
    const { isSubscribed, subscribe, unsubscribe } = useStationSubscription(station.id.toString(), station.station_name);
    const { toast } = useToast();
    const [animKey, setAnimKey] = useState(0);

    const stale = isStale(station.current_levels?.updated_at);

    const getBorderColor = (alertLevel: number, isStale: boolean) => {
        if (isStale) return 'border-l-muted-foreground/30';
        switch (alertLevel) {
            case 0: return 'border-l-normal';
            case 1: return 'border-l-alert';
            case 2: return 'border-l-warning';
            case 3: return 'border-l-danger';
            default: return 'border-l-muted-foreground/30';
        }
    };

    const alertLevel = station.current_levels ? Number(station.current_levels.alert_level) : -1;
    const borderColor = getBorderColor(alertLevel, stale);

    const handleBellClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setAnimKey(k => k + 1);

        if (isSubscribed) {
            unsubscribe().catch(() => {
                // silently handle background unsubscribe failure
            });
            toast({
                title: `🔕 Unsubscribed from ${station.station_name}`,
                description: "You'll no longer receive alerts for this station",
            });
        } else {
            subscribe().catch(() => {
                // silently handle background subscribe failure
            });
            toast({
                title: `🔔 Subscribed to ${station.station_name}`,
                description: "You'll receive alerts when this station reaches danger level",
            });
        }
    };

    return (
        <Card
            className={cn(
                "mb-3 cursor-pointer transition-all duration-200 hover:shadow-md theme-transition-colors",
                "border border-border/50 hover:border-primary/50",
                "active:scale-[0.98] active:border-primary",
                "border-l-4",
                borderColor,
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
                        <div className="flex items-center justify-between">
                            <p className="text-metadata truncate">{station.districts.name}</p>
                            {distance !== undefined && (
                                <Badge variant="secondary" className="ml-2 text-xs">
                                    {formatDistance(distance)}
                                </Badge>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        aria-label="Toggle notification subscription"
                        data-subscribed={isSubscribed ? "true" : "false"}
                        onClick={handleBellClick}
                        className="ml-2 p-1 rounded-full hover:bg-muted transition-colors flex-shrink-0"
                    >
                        <span key={animKey} className={cn("inline-flex", animKey > 0 && "animate-bell-ring")}>
                            {isSubscribed ? (
                                <BellRingIcon size="sm" className="text-primary" />
                            ) : (
                                <BellIcon size="sm" className="text-muted-foreground" />
                            )}
                        </span>
                    </button>
                </div>

                {/* Data Row with Mini Chart */}
                <div className="flex items-center justify-between">
                    {/* Left: Water Level */}
                    <div className="flex items-center gap-2">
                        <WaterIcon size="sm" />
                        <div>
                            <span className="text-water-level">
                                {station.current_levels?.current_level ?? '\u2014'}<span className="text-body-small font-normal">m</span>
                            </span>
                        </div>
                    </div>

                    {/* Center: Mini Trend Chart */}
                    <div className="flex-1 flex justify-center px-4">
                        <MicroTrendChart
                            stationId={station.id.toString()}
                            currentLevel={station.current_levels?.current_level ?? 0}
                            alertLevel={station.current_levels ? Number(station.current_levels.alert_level) : -1}
                            normalLevel={station.normal_water_level}
                            dangerLevel={station.danger_water_level}
                        />
                    </div>

                    {/* Right: Status */}
                    <div className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                            <AlertLevelBadge
                                alert_level={stale ? -1 : (station.current_levels ? Number(station.current_levels.alert_level) : -1)}
                                className="text-xs"
                            />
                        </div>
                    </div>
                </div>

                {/* Bottom Row: Last Updated */}
                <div className={cn("flex items-center justify-center gap-1 pt-1", stale ? "text-destructive" : "text-metadata")}>
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
