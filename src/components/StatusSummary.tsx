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

/**
 * A count strip, not a legend. The number is the object of interest, so it gets
 * mono weight and the status colour; the word beside it stays quiet. A left
 * hairline separates segments instead of a dot floating beside each one.
 */
const STATUS_CONFIG: Record<
    StatusKey,
    { label: string; countClass: string; filterValue: string }
> = {
    normal: { label: 'normal', countClass: 'text-normal', filterValue: '0' },
    alert: { label: 'alert', countClass: 'text-alert', filterValue: '1' },
    warning: { label: 'warning', countClass: 'text-warning', filterValue: '2' },
    danger: { label: 'danger', countClass: 'text-danger', filterValue: '3' },
    noData: { label: 'no data', countClass: 'text-muted-foreground', filterValue: '-1' },
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

    const visibleKeys = (Object.keys(STATUS_CONFIG) as StatusKey[]).filter(
        (key) => counts[key] > 0
    )

    if (visibleKeys.length === 0) return null

    return (
        <div className="rule-b flex flex-wrap">
            {visibleKeys.map((key, index) => {
                const config = STATUS_CONFIG[key]
                const count = counts[key]

                const isActive =
                    advancedFilters.alertLevels.length === 1 &&
                    advancedFilters.alertLevels[0] === config.filterValue

                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => handleSegmentClick(config.filterValue)}
                        aria-pressed={isActive}
                        className={`min-h-touch flex min-w-[5.5rem] flex-1 flex-col items-start justify-center gap-0.5 py-3 pr-4 text-left theme-transition-colors ${
                            index > 0 ? 'rule-l pl-4' : ''
                        } ${isActive ? 'bg-muted/60' : 'hover:bg-muted/40'}`}
                    >
                        <span className={`text-readout text-lg font-bold ${config.countClass}`}>
                            {count}
                        </span>
                        <span className="text-eyebrow text-muted-foreground">{config.label}</span>
                    </button>
                )
            })}
        </div>
    )
}
