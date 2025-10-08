import React, { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { cn } from '@/lib/utils'
import { haptics } from '@/utils/haptics'
import {
    FilterIcon,
    //   SearchIcon, 
    CloseIcon,
    LocationIcon,
    WaterIcon,
    StatusNormalIcon,
    StatusAlertIcon,
    StatusWarningIcon,
    StatusDangerIcon,
    FavoriteIcon,
    CameraIcon,
    TimeIcon
} from '@/components/icons/IconLibrary'
import { Id } from "../convex/_generated/dataModel"

export interface FilterOptions {
    //   search: string
    districts: string[]
    alertLevels: string[]
    sortBy: 'name' | 'waterLevel' | 'lastUpdated' | 'district'
    sortOrder: 'asc' | 'desc'
    showFavoritesOnly: boolean
    showCameraOnly: boolean
    showOfflineStations: boolean
    waterLevelRange: {
        min: number | null
        max: number | null
    }
}

interface Station {
    id: Id<"stations"> | number
    station_name: string
    districts: { name: string }
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
    station_status: boolean
}

interface AdvancedFilterProps {
    stations: Station[]
    onFilterChange: (filteredStations: Station[], activeFilters: FilterOptions) => void
    isLoggedIn: boolean
    favoriteStations: string[]
    className?: string
}

const DEFAULT_FILTERS: FilterOptions = {
    //   search: '',
    districts: [],
    alertLevels: [],
    sortBy: 'name',
    sortOrder: 'asc',
    showFavoritesOnly: false,
    showCameraOnly: false,
    showOfflineStations: true,
    waterLevelRange: { min: null, max: null }
}

export default function AdvancedFilter({
    stations,
    onFilterChange,
    isLoggedIn,
    favoriteStations,
    className
}: AdvancedFilterProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS)

    // Get unique districts
    const availableDistricts = useMemo(() => {
        const districts = new Set(stations.map(station => station.districts.name))
        return Array.from(districts).sort()
    }, [stations])

    // Get alert level statistics
    const alertLevelStats = useMemo(() => {
        const stats = { '0': 0, '1': 0, '2': 0, '3': 0 }
        stations.forEach(station => {
            const level = station.current_levels?.alert_level || '0'
            if (level in stats) stats[level as keyof typeof stats]++
        })
        return stats
    }, [stations])

    // Apply filters and return filtered stations
    const filteredStations = useMemo(() => {
        let filtered = [...stations]

        // Search filter
        // if (filters.search.trim()) {
        //   const searchTerm = filters.search.toLowerCase()
        //   filtered = filtered.filter(station =>
        //     station.station_name.toLowerCase().includes(searchTerm) ||
        //     station.districts.name.toLowerCase().includes(searchTerm)
        //   )
        // }

        // District filter
        if (filters.districts.length > 0) {
            filtered = filtered.filter(station =>
                filters.districts.includes(station.districts.name)
            )
        }

        // Alert level filter
        if (filters.alertLevels.length > 0) {
            filtered = filtered.filter(station =>
                filters.alertLevels.includes(station.current_levels?.alert_level || '0')
            )
        }

        // Favorites filter
        if (filters.showFavoritesOnly && isLoggedIn) {
            filtered = filtered.filter(station =>
                favoriteStations.includes(station.id.toString())
            )
        }

        // Camera filter
        if (filters.showCameraOnly) {
            filtered = filtered.filter(station => station.cameras !== null)
        }

        // Offline stations filter
        if (!filters.showOfflineStations) {
            filtered = filtered.filter(station => station.station_status)
        }

        // Water level range filter
        if (filters.waterLevelRange.min !== null || filters.waterLevelRange.max !== null) {
            filtered = filtered.filter(station => {
                const level = station.current_levels?.current_level
                if (level === undefined) return false

                const minValid = filters.waterLevelRange.min === null || level >= filters.waterLevelRange.min
                const maxValid = filters.waterLevelRange.max === null || level <= filters.waterLevelRange.max
                return minValid && maxValid
            })
        }

        // Sort results
        filtered.sort((a, b) => {
            let comparison = 0

            switch (filters.sortBy) {
                case 'name':
                    comparison = a.station_name.localeCompare(b.station_name)
                    break
                case 'waterLevel':
                    const aLevel = a.current_levels?.current_level || 0
                    const bLevel = b.current_levels?.current_level || 0
                    comparison = aLevel - bLevel
                    break
                case 'lastUpdated':
                    const aTime = new Date(a.current_levels?.updated_at || 0).getTime()
                    const bTime = new Date(b.current_levels?.updated_at || 0).getTime()
                    comparison = bTime - aTime // Most recent first by default
                    break
                case 'district':
                    comparison = a.districts.name.localeCompare(b.districts.name)
                    break
            }

            return filters.sortOrder === 'desc' ? -comparison : comparison
        })

        return filtered
    }, [stations, filters, isLoggedIn, favoriteStations])

    // Update filters and trigger callback
    const updateFilters = (newFilters: Partial<FilterOptions>) => {
        const updatedFilters = { ...filters, ...newFilters }
        setFilters(updatedFilters)
    }

    // Apply filters
    const applyFilters = () => {
        if (typeof window !== 'undefined') {
            haptics.tap()
        }
        onFilterChange(filteredStations, filters)
        setIsOpen(false)
    }

    // Clear all filters
    const clearFilters = () => {
        if (typeof window !== 'undefined') {
            haptics.tap()
        }
        setFilters(DEFAULT_FILTERS)
        onFilterChange(stations, DEFAULT_FILTERS)
    }

    // Count active filters
    const activeFilterCount = useMemo(() => {
        let count = 0
        // if (filters.search.trim()) count++
        if (filters.districts.length > 0) count++
        if (filters.alertLevels.length > 0) count++
        if (filters.showFavoritesOnly) count++
        if (filters.showCameraOnly) count++
        if (!filters.showOfflineStations) count++
        if (filters.waterLevelRange.min !== null || filters.waterLevelRange.max !== null) count++
        return count
    }, [filters])

    const toggleDistrict = (district: string) => {
        const newDistricts = filters.districts.includes(district)
            ? filters.districts.filter(d => d !== district)
            : [...filters.districts, district]
        updateFilters({ districts: newDistricts })
    }

    const toggleAlertLevel = (level: string) => {
        const newLevels = filters.alertLevels.includes(level)
            ? filters.alertLevels.filter(l => l !== level)
            : [...filters.alertLevels, level]
        updateFilters({ alertLevels: newLevels })
    }

    const getAlertLevelIcon = (level: string) => {
        switch (level) {
            case '0': return <StatusNormalIcon size="xs" />
            case '1': return <StatusAlertIcon size="xs" />
            case '2': return <StatusWarningIcon size="xs" />
            case '3': return <StatusDangerIcon size="xs" />
            default: return <StatusNormalIcon size="xs" />
        }
    }

    const getAlertLevelName = (level: string) => {
        switch (level) {
            case '0': return 'Normal'
            case '1': return 'Alert'
            case '2': return 'Warning'
            case '3': return 'Danger'
            default: return 'Normal'
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                        "relative theme-transition-colors",
                        activeFilterCount > 0 && "border-primary bg-primary/5",
                        className
                    )}
                >
                    <FilterIcon size="sm" />
                    <span className="hidden sm:inline sm:ml-2">Filter</span>
                    {activeFilterCount > 0 && (
                        <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs">
                            {activeFilterCount}
                        </Badge>
                    )}
                </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto theme-transition-colors">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FilterIcon size="md" />
                        Advanced Filters
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Search */}
                    {/* <div className="space-y-2">
            <label className="text-sm font-medium">Search Stations</label>
            <div className="relative">
              <SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by station name or district..."
                value={filters.search}
                onChange={(e) => updateFilters({ search: e.target.value })}
                className="pl-10"
              />
            </div>
          </div> */}

                    <Separator />

                    {/* Districts */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium flex items-center gap-2">
                            <LocationIcon size="sm" />
                            Districts ({filters.districts.length} selected)
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {availableDistricts.map(district => (
                                <Button
                                    key={district}
                                    variant={filters.districts.includes(district) ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => toggleDistrict(district)}
                                    className="theme-transition-colors"
                                >
                                    {district}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <Separator />

                    {/* Alert Levels */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium flex items-center gap-2">
                            <WaterIcon size="sm" />
                            Alert Levels ({filters.alertLevels.length} selected)
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(alertLevelStats).map(([level, count]) => (
                                <Button
                                    key={level}
                                    variant={filters.alertLevels.includes(level) ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => toggleAlertLevel(level)}
                                    className="justify-start theme-transition-colors"
                                >
                                    <div className="flex items-center gap-2 w-full">
                                        {getAlertLevelIcon(level)}
                                        <span>{getAlertLevelName(level)}</span>
                                        <Badge variant="secondary" className="ml-auto">
                                            {count}
                                        </Badge>
                                    </div>
                                </Button>
                            ))}
                        </div>
                    </div>

                    <Separator />

                    {/* Sorting */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium">Sort & Order</label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs text-muted-foreground">Sort by</label>
                                <Select value={filters.sortBy} onValueChange={(value: any) => updateFilters({ sortBy: value })}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="name">Station Name</SelectItem>
                                        <SelectItem value="waterLevel">Water Level</SelectItem>
                                        <SelectItem value="lastUpdated">Last Updated</SelectItem>
                                        <SelectItem value="district">District</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-muted-foreground">Order</label>
                                <Select value={filters.sortOrder} onValueChange={(value: any) => updateFilters({ sortOrder: value })}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="asc">Ascending</SelectItem>
                                        <SelectItem value="desc">Descending</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Toggle Filters */}
                    <div className="space-y-4">
                        <label className="text-sm font-medium">Filter Options</label>

                        {isLoggedIn && (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <FavoriteIcon size="sm" />
                                    <span>Favorites only</span>
                                </div>
                                <Switch
                                    checked={filters.showFavoritesOnly}
                                    onCheckedChange={(checked) => updateFilters({ showFavoritesOnly: checked })}
                                />
                            </div>
                        )}

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CameraIcon size="sm" />
                                <span>Stations with cameras only</span>
                            </div>
                            <Switch
                                checked={filters.showCameraOnly}
                                onCheckedChange={(checked) => updateFilters({ showCameraOnly: checked })}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <TimeIcon size="sm" />
                                <span>Include offline stations</span>
                            </div>
                            <Switch
                                checked={filters.showOfflineStations}
                                onCheckedChange={(checked) => updateFilters({ showOfflineStations: checked })}
                            />
                        </div>
                    </div>

                    <Separator />

                    {/* Water Level Range */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium">Water Level Range (meters)</label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs text-muted-foreground">Minimum</label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    placeholder="0.0"
                                    value={filters.waterLevelRange.min?.toString() || ''}
                                    onChange={(e) => {
                                        const value = e.target.value ? parseFloat(e.target.value) : null
                                        updateFilters({
                                            waterLevelRange: { ...filters.waterLevelRange, min: value }
                                        })
                                    }}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-muted-foreground">Maximum</label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    placeholder="10.0"
                                    value={filters.waterLevelRange.max?.toString() || ''}
                                    onChange={(e) => {
                                        const value = e.target.value ? parseFloat(e.target.value) : null
                                        updateFilters({
                                            waterLevelRange: { ...filters.waterLevelRange, max: value }
                                        })
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-between pt-4 border-t">
                    <Button
                        variant="outline"
                        onClick={clearFilters}
                        className="theme-transition-colors"
                    >
                        <CloseIcon size="sm" className="mr-2" />
                        Clear All
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setIsOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button onClick={applyFilters}>
                            Apply Filters ({filteredStations.length} results)
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}