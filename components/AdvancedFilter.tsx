import React, { useState, useMemo, useCallback } from 'react'
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
import { useFilter, FilterOptions } from '../lib/FilterContext'

// Remove the duplicate FilterOptions interface since it's now imported from FilterContext
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

export default function AdvancedFilter({
    stations,
    onFilterChange,
    isLoggedIn,
    favoriteStations,
    className
}: AdvancedFilterProps) {
    const [isOpen, setIsOpen] = useState(false)

    // Use the global filter context instead of local state
    const { advancedFilters: filters, updateAdvancedFilters, clearAdvancedFilters, hasActiveAdvancedFilters } = useFilter()

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

    // Helper function to apply filters to stations
    const applyFiltersToStations = useCallback((stationsToFilter: Station[], filtersToApply: FilterOptions) => {
        let filtered = [...stationsToFilter]

        // District filter
        if (filtersToApply.districts.length > 0) {
            filtered = filtered.filter(station =>
                filtersToApply.districts.includes(station.districts.name)
            )
        }

        // Alert level filter
        if (filtersToApply.alertLevels.length > 0) {
            filtered = filtered.filter(station =>
                filtersToApply.alertLevels.includes(station.current_levels?.alert_level || '0')
            )
        }

        // Favorites filter
        if (filtersToApply.showFavoritesOnly && isLoggedIn) {
            filtered = filtered.filter(station =>
                favoriteStations.includes(station.id.toString())
            )
        }

        // Camera filter
        if (filtersToApply.showCameraOnly) {
            filtered = filtered.filter(station => station.cameras !== null)
        }

        // Offline stations filter
        if (!filtersToApply.showOfflineStations) {
            filtered = filtered.filter(station => station.station_status)
        }

        // Water level range filter
        if (filtersToApply.waterLevelRange.min !== null || filtersToApply.waterLevelRange.max !== null) {
            filtered = filtered.filter(station => {
                const level = station.current_levels?.current_level
                if (level === undefined) return false

                const minValid = filtersToApply.waterLevelRange.min === null || level >= filtersToApply.waterLevelRange.min
                const maxValid = filtersToApply.waterLevelRange.max === null || level <= filtersToApply.waterLevelRange.max
                return minValid && maxValid
            })
        }

        // Sort results
        filtered.sort((a, b) => {
            let comparison = 0

            switch (filtersToApply.sortBy) {
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

            return filtersToApply.sortOrder === 'desc' ? -comparison : comparison
        })

        return filtered
    }, [isLoggedIn, favoriteStations])

    // Apply filters and return filtered stations
    const filteredStations = useMemo(() => {
        return applyFiltersToStations(stations, filters)
    }, [stations, filters, applyFiltersToStations])

    // Update filters - no need to call onFilterChange since we use global context
    const updateFilters = (newFilters: Partial<FilterOptions>) => {
        updateAdvancedFilters(newFilters)
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
        clearAdvancedFilters()
        onFilterChange(stations, {
            districts: [],
            alertLevels: [],
            sortBy: 'name',
            sortOrder: 'asc',
            showFavoritesOnly: false,
            showCameraOnly: false,
            showOfflineStations: false, // Updated to match new default
            waterLevelRange: { min: 0, max: null } // Updated to match new default
        })
    }

    // Count active filters - use the context function
    const activeFilterCount = hasActiveAdvancedFilters ? Object.keys(filters).reduce((count, key) => {
        const filterKey = key as keyof FilterOptions
        switch (filterKey) {
            case 'districts':
            case 'alertLevels':
                return count + (filters[filterKey].length > 0 ? 1 : 0)
            case 'showFavoritesOnly':
            case 'showCameraOnly':
                return count + (filters[filterKey] ? 1 : 0)
            case 'showOfflineStations':
                return count + (filters[filterKey] !== false ? 1 : 0) // Updated: false is now default
            case 'waterLevelRange':
                return count + ((filters[filterKey].min !== null && filters[filterKey].min !== 0) || filters[filterKey].max !== null ? 1 : 0) // Updated: 0 is now default
            case 'sortBy':
                return count + (filters[filterKey] !== 'name' ? 1 : 0)
            case 'sortOrder':
                return count + (filters[filterKey] !== 'asc' ? 1 : 0)
            default:
                return count
        }
    }, 0) : 0

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
                        hasActiveAdvancedFilters && "border-primary bg-primary/5",
                        className
                    )}
                >
                    <FilterIcon size="sm" />
                    <span className="hidden sm:inline sm:ml-2">Filter</span>
                    {hasActiveAdvancedFilters && (
                        <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs">
                            {activeFilterCount}
                        </Badge>
                    )}
                </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col theme-transition-colors">
                <DialogHeader className="flex-shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <FilterIcon size="md" />
                        Advanced Filters
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-6 pr-1">
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
                                        {/* <SelectItem value="nearest">Nearest to Me</SelectItem> */}
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
                    <div className="space-y-3 pb-4">
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

                {/* Sticky Action Buttons */}
                <div className="flex-shrink-0 border-t bg-background/95 backdrop-blur-sm p-4 -mx-6 -mb-6 mt-4">
                    <div className="flex justify-between items-center">
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
                            <Button
                                onClick={applyFilters}
                                className="font-medium"
                            >
                                Apply Filters ({filteredStations.length} results)
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}