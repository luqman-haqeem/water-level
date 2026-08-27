import { useMemo } from 'react'
import { useFilter } from '@/lib/FilterContext'
import { isStale } from '@/utils/timeUtils'

interface StationForSummary {
    station_status: boolean
    current_levels: {
        current_level: number
        updated_at: string | number | undefined
        alert_level: string
    } | null
}

interface StatusSummaryProps {
    stations: StationForSummary[]
}

type StatusKey = 'normal' | 'alert' | 'warning' | 'danger' | 'noData'

const STATUS_CONFIG: Record<StatusKey, { label: string; dotClass: string; filterValue: string }> = {
    normal: { label: 'normal', dotClass: 'bg-normal', filterValue: '0' },
    alert: { label: 'alert', dotClass: 'bg-alert', filterValue: '1' },
    warning: { label: 'warning', dotClass: 'bg-warning', filterValue: '2' },
    danger: { label: 'danger', dotClass: 'bg-danger', filterValue: '3' },
    noData: { label: 'no data', dotClass: 'bg-muted-foreground/50', filterValue: '-1' },
}

export default function StatusSummary({ stations }: StatusSummaryProps) {
    const { advancedFilters, updateAdvancedFilters } = useFilter()

    const counts = useMemo(() => {
        const result: Record<StatusKey, number> = {
            normal: 0,
            alert: 0,
            warning: 0,
            danger: 0,
            noData: 0,
        }

        // Only count online stations
        const onlineStations = stations.filter(s => s.station_status)

        for (const station of onlineStations) {
            const alertLevel = station.current_levels?.alert_level
            const updatedAt = station.current_levels?.updated_at

            // Stale or missing data counts as "no data"
            if (isStale(updatedAt) || alertLevel === undefined || alertLevel === null) {
                result.noData++
                continue
            }

            switch (alertLevel) {
                case '0':
                    result.normal++
                    break
                case '1':
                    result.alert++
                    break
                case '2':
                    result.warning++
                    break
                case '3':
                    result.danger++
                    break
                default:
                    result.noData++
            }
        }

        return result
    }, [stations])

    const handleSegmentClick = (filterValue: string) => {
        const currentLevels = advancedFilters.alertLevels
        // If this level is already the only active filter, clear it
        if (currentLevels.length === 1 && currentLevels[0] === filterValue) {
            updateAdvancedFilters({ alertLevels: [] })
        } else {
            updateAdvancedFilters({ alertLevels: [filterValue] })
        }
    }

    return (
        <div className="flex items-center gap-3 flex-wrap px-1 py-2">
            {(Object.keys(STATUS_CONFIG) as StatusKey[]).map((key) => {
                const config = STATUS_CONFIG[key]
                const count = counts[key]
                if (count === 0) return null

                const isActive =
                    advancedFilters.alertLevels.length === 1 &&
                    advancedFilters.alertLevels[0] === config.filterValue

                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => handleSegmentClick(config.filterValue)}
                        className={`flex items-center gap-1.5 text-sm transition-opacity ${
                            isActive ? 'opacity-100 font-medium' : 'opacity-70 hover:opacity-100'
                        }`}
                    >
                        <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${config.dotClass}`}
                            aria-hidden="true"
                        />
                        <span>{count} {config.label}</span>
                    </button>
                )
            })}
        </div>
    )
}
