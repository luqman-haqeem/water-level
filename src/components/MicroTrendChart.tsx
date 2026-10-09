import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useStationTrend } from '@/hooks/useWaterLevelHistory'

interface MicroTrendChartProps {
    stationId: string
    currentLevel: number
    alertLevel: number
    /** null/undefined = JPS publishes no threshold for this station (#73). */
    normalLevel?: number | null
    dangerLevel?: number | null
    className?: string
}

export default function MicroTrendChart({
    stationId,
    currentLevel,
    alertLevel,
    normalLevel,
    dangerLevel,
    className
}: MicroTrendChartProps) {
    // Fetch trend data via Convex reactive subscription
    const { data: trendData } = useStationTrend(stationId)

    // Calculate micro chart path
    const chartPath = useMemo(() => {
        if (!trendData || trendData.length < 2) {
            // Show flat line if no data
            return "M 8 20 L 32 20"
        }

        const points = trendData.map((point: any) => point.currentLevel)

        // Determine y-axis range: use normalLevel/dangerLevel if available and valid
        let minLevel: number
        let maxLevel: number

        // The `!(normalLevel === 0 && dangerLevel === 0)` special case that used to
        // live here was a workaround for absent thresholds arriving as 0. They now
        // arrive as null, so "absent" is expressible and the guard is just a null
        // check (#73).
        const hasThresholds =
            normalLevel !== undefined && normalLevel !== null &&
            dangerLevel !== undefined && dangerLevel !== null

        if (hasThresholds) {
            minLevel = normalLevel
            maxLevel = dangerLevel
        } else {
            // Fall back to local min/max
            minLevel = Math.min(...points)
            maxLevel = Math.max(...points)
        }

        const range = maxLevel - minLevel || 1

        // Create micro SVG path (40x24 viewBox)
        const pathPoints = points.map((level: number, index: number) => {
            const x = 8 + (index / (points.length - 1)) * 24 // 8px padding, 24px width
            // Clamp level to the range so points outside are pinned to edges
            const clamped = Math.max(minLevel, Math.min(maxLevel, level))
            const y = 4 + (1 - (clamped - minLevel) / range) * 16 // 4px padding, 16px height
            return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
        })

        return pathPoints.join(' ')
    }, [trendData, normalLevel, dangerLevel])

    // Get line color based on alert level — unified status tokens
    const getLineColor = (level: number) => {
        switch (level) {
            case 0: return 'stroke-normal'
            case 1: return 'stroke-alert'
            case 2: return 'stroke-warning'
            case 3: return 'stroke-danger'
            default: return 'stroke-muted-foreground'
        }
    }

    const lineColor = getLineColor(alertLevel)

    // Loading state - show animated placeholder
    if (trendData === undefined) {
        return (
            <div className={cn("w-10 h-6 bg-muted/20 rounded animate-pulse", className)} />
        )
    }

    return (
        <svg
            width={40}
            height={24}
            viewBox="0 0 40 24"
            className={cn("flex-shrink-0", className)}
        >
            <path
                d={chartPath}
                fill="none"
                className={`${lineColor} transition-colors`}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}
