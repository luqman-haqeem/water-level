import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useQuery } from "convex/react"
import { api } from "../convex/_generated/api"
import { Id } from "../convex/_generated/dataModel"

interface MicroTrendChartProps {
    stationId: string
    currentLevel: number
    alertLevel: number
    className?: string
}

export default function MicroTrendChart({
    stationId,
    currentLevel,
    alertLevel,
    className
}: MicroTrendChartProps) {
    // Fetch trend data from Convex
    const trendData = useQuery(api.waterLevelHistory.getStationTrend, {
        stationId: stationId as Id<"stations">
    })

    // Calculate micro chart path
    const chartPath = useMemo(() => {
        if (!trendData || trendData.length < 2) {
            // Show flat line if no data
            return "M 8 20 L 32 20"
        }

        const points = trendData.map((point: any) => point.currentLevel)
        const minLevel = Math.min(...points)
        const maxLevel = Math.max(...points)
        const range = maxLevel - minLevel || 1

        // Create micro SVG path (40x24 viewBox)
        const pathPoints = points.map((level, index) => {
            const x = 8 + (index / (points.length - 1)) * 24 // 8px padding, 24px width
            const y = 4 + (1 - (level - minLevel) / range) * 16 // 4px padding, 16px height
            return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
        })

        return pathPoints.join(' ')
    }, [trendData])

    // Get line color based on alert level
    const getLineColor = (level: number) => {
        switch (level) {
            case 0: return 'stroke-success'
            case 1: return 'stroke-alert'
            case 2: return 'stroke-warning'
            case 3: return 'stroke-destructive'
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