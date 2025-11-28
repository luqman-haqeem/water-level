import { useMemo, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { haptics } from '@/utils/haptics'
import { useQuery } from "convex/react"
import { api } from "../convex/_generated/api"
import { Id } from "../convex/_generated/dataModel"
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

interface TrendDataPoint {
    timestamp: number
    currentLevel: number
    alertLevel: number
    recordedAt: string
}

interface MiniTrendChartProps {
    stationId: string
    currentLevel: number
    thresholds: {
        normal: number
        alert: number
        warning: number
        danger: number
    }
    height?: number
    className?: string
}

export default function MiniTrendChart({
    stationId,
    currentLevel,
    thresholds,
    height = 80,
    className
}: MiniTrendChartProps) {
    const [hoveredPoint, setHoveredPoint] = useState<TrendDataPoint | null>(null)
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

    // Fetch trend data from Convex
    const trendData = useQuery(api.waterLevelHistory.getStationTrend, {
        stationId: stationId as Id<"stations">
    })

    // Calculate chart dimensions and data points
    const chartData = useMemo(() => {
        if (!trendData || trendData.length === 0) {
            return null
        }

        const points = trendData.map((point: any) => ({
            timestamp: point.timestamp,
            currentLevel: point.currentLevel,
            alertLevel: point.alertLevel,
            recordedAt: point.recordedAt
        }))

        // Chart dimensions
        const width = 280 // Fixed width for consistency
        const padding = 20
        const chartWidth = width - (padding * 2)
        const chartHeight = height - (padding * 2)

        // Find data range with dynamic scaling for better visibility
        const levels = points.map(p => p.currentLevel)
        const dataMin = Math.min(...levels)
        const dataMax = Math.max(...levels)
        const dataRange = dataMax - dataMin

        // Apply dynamic range enhancement for small variations
        const MINIMUM_RANGE = 2.0 // Minimum 2m range for visibility
        const RANGE_MULTIPLIER = 1.5 // Amplify small ranges by 50%

        let effectiveRange = dataRange
        if (dataRange < MINIMUM_RANGE) {
            effectiveRange = MINIMUM_RANGE
        } else if (dataRange < 5.0) {
            // For ranges 0-5m, apply amplification
            effectiveRange = Math.max(dataRange * RANGE_MULTIPLIER, MINIMUM_RANGE)
        }

        // Center the enhanced range around the data
        const dataMidpoint = (dataMax + dataMin) / 2
        const minLevel = Math.max(dataMidpoint - effectiveRange / 2, Math.min(thresholds.normal, dataMin - 0.5))
        const maxLevel = Math.min(dataMidpoint + effectiveRange / 2, Math.max(thresholds.danger, dataMax + 0.5))
        const levelRange = maxLevel - minLevel || 1

        // Create SVG path points
        const svgPoints = points.map((point, index) => {
            const x = padding + (index / (points.length - 1)) * chartWidth
            const y = padding + chartHeight - ((point.currentLevel - minLevel) / levelRange) * chartHeight
            return { ...point, x, y }
        })

        // Generate SVG path string
        const pathString = svgPoints.reduce((path, point, index) => {
            const command = index === 0 ? 'M' : 'L'
            return `${path} ${command} ${point.x} ${point.y}`
        }, '')

        // Calculate threshold positions
        const getThresholdY = (level: number) =>
            padding + chartHeight - ((level - minLevel) / levelRange) * chartHeight

        return {
            points: svgPoints,
            pathString,
            width,
            chartHeight,
            padding,
            thresholds: {
                normal: getThresholdY(thresholds.normal),
                alert: getThresholdY(thresholds.alert),
                warning: getThresholdY(thresholds.warning),
                danger: getThresholdY(thresholds.danger)
            },
            // Add trend analysis
            trend: {
                direction: points.length >= 2 ?
                    (points[points.length - 1].currentLevel > points[0].currentLevel ? 'up' :
                        points[points.length - 1].currentLevel < points[0].currentLevel ? 'down' : 'stable') : 'stable',
                change: points.length >= 2 ?
                    points[points.length - 1].currentLevel - points[0].currentLevel : 0,
                recentChange: points.length >= 2 ?
                    points[points.length - 1].currentLevel - points[points.length - 2].currentLevel : 0
            }
        }
    }, [trendData, height, thresholds])

    // Get current alert level color
    const getAlertColor = (alertLevel: number) => {
        switch (alertLevel) {
            case 0: return 'text-success stroke-success'
            case 1: return 'text-alert stroke-alert'
            case 2: return 'text-warning stroke-warning'
            case 3: return 'text-destructive stroke-destructive'
            default: return 'text-muted-foreground stroke-muted-foreground'
        }
    }

    const currentAlertLevel = chartData?.points[chartData.points.length - 1]?.alertLevel || 0
    const lineColorClass = getAlertColor(currentAlertLevel)

    // Trend arrow component
    const TrendArrow = ({ direction, change }: { direction: string, change: number }) => {
        if (direction === 'stable' || Math.abs(change) < 0.1) return null

        const isUp = direction === 'up'
        const arrowColor = isUp ? 'text-red-600' : 'text-green-600'
        const changeText = `${isUp ? '+' : ''}${change.toFixed(1)}m`

        return (
            <div className={`absolute top-1 right-1 flex items-center space-x-1 px-1.5 py-0.5 rounded text-xs font-medium ${arrowColor} bg-background/80 backdrop-blur-sm border`}>
                <span className="text-xs">{isUp ? '↗' : '↘'}</span>
                <span>{changeText}</span>
            </div>
        )
    }

    // Handle point interaction - memoized for performance
    const handlePointInteraction = useCallback((point: TrendDataPoint, event: React.MouseEvent) => {
        setHoveredPoint(point)
        setMousePosition({ x: event.clientX, y: event.clientY })
        haptics.tap()
    }, [])

    const handleMouseLeave = useCallback(() => {
        setHoveredPoint(null)
    }, [])
    // Format time for tooltip - memoized for performance
    const formatTime = useCallback((recordedAt: string) => {
        try {
            // Parse timestamp (already in Malaysian time) and format as 24-hour time
            // Remove 'Z' from timestamp since it's already in Malaysian time, not UTC
            const cleanTimestamp = recordedAt.replace('Z', '')
            return dayjs(cleanTimestamp).format('h:mm A') // 12-hour format like "8:33 PM"
        } catch {
            return 'Unknown'
        }
    }, [])

    // Loading state
    if (trendData === undefined) {
        return (
            <div className={cn("flex items-center justify-center bg-muted/20 rounded-lg animate-pulse", className)} style={{ height }}>
                <div className="flex flex-col items-center space-y-2">
                    <div className="w-16 h-4 bg-muted rounded"></div>
                    <div className="text-xs text-muted-foreground">Loading trend...</div>
                </div>
            </div>
        )
    }

    // Empty state
    if (!chartData || chartData.points.length === 0) {
        return (
            <div className={cn("flex items-center justify-center bg-muted/10 rounded-lg border border-dashed border-muted", className)} style={{ height }}>
                <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-1">Building trend...</div>
                    <div className="text-xs text-muted-foreground">Data will appear within 3 hours</div>
                </div>
            </div>
        )
    }

    return (
        <div className={cn("relative bg-background rounded-lg border", className)} style={{ height }}>
            {/* Trend indicator */}
            {chartData.trend && (
                <TrendArrow
                    direction={chartData.trend.direction}
                    change={chartData.trend.change}
                />
            )}

            <svg
                width={chartData.width}
                height={height}
                viewBox={`0 0 ${chartData.width} ${height}`}
                className="w-full h-full"
                onMouseLeave={handleMouseLeave}
            >
                {/* Threshold lines */}
                <line
                    x1={chartData.padding}
                    y1={chartData.thresholds.danger}
                    x2={chartData.width - chartData.padding}
                    y2={chartData.thresholds.danger}
                    className="stroke-destructive/20"
                    strokeWidth={1}
                />
                <line
                    x1={chartData.padding}
                    y1={chartData.thresholds.warning}
                    x2={chartData.width - chartData.padding}
                    y2={chartData.thresholds.warning}
                    className="stroke-warning/20"
                    strokeWidth={1}
                />
                <line
                    x1={chartData.padding}
                    y1={chartData.thresholds.alert}
                    x2={chartData.width - chartData.padding}
                    y2={chartData.thresholds.alert}
                    className="stroke-alert/20"
                    strokeWidth={1}
                />

                {/* Trend line */}
                <path
                    d={chartData.pathString}
                    fill="none"
                    className={`${lineColorClass} transition-colors`}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                {/* Interactive points */}
                {chartData.points.map((point, index) => (
                    <circle
                        key={index}
                        cx={point.x}
                        cy={point.y}
                        r={8}
                        className="fill-transparent cursor-pointer hover:fill-primary/20 transition-all duration-200"
                        onMouseEnter={(e) => handlePointInteraction(point, e)}
                        onClick={(e) => handlePointInteraction(point, e)}
                    />
                ))}

                {/* Enhanced visible data points */}
                {chartData.points.map((point, index) => {
                    const isLatest = index === chartData.points.length - 1
                    return (
                        <g key={`visible-${index}`}>
                            <circle
                                cx={point.x}
                                cy={point.y}
                                r={isLatest ? 4 : 2.5}
                                className={`${getAlertColor(point.alertLevel)} fill-current pointer-events-none transition-all duration-300`}
                                filter={isLatest ? "url(#glow)" : undefined}
                            />
                            {/* White inner dot for better contrast */}
                            <circle
                                cx={point.x}
                                cy={point.y}
                                r={isLatest ? 1.5 : 1}
                                className="fill-background pointer-events-none"
                            />
                        </g>
                    )
                })}
            </svg>

            {/* Tooltip */}
            {hoveredPoint && (
                <div
                    className="fixed z-50 px-2 py-1 bg-popover border rounded shadow-lg pointer-events-none"
                    style={{
                        left: mousePosition.x + 10,
                        top: mousePosition.y - 40,
                        transform: mousePosition.x > window.innerWidth - 120 ? 'translateX(-100%)' : undefined
                    }}
                >
                    <div className="text-xs font-medium">{hoveredPoint.currentLevel.toFixed(2)}m</div>
                    <div className="text-xs text-muted-foreground">{formatTime(hoveredPoint.recordedAt)}</div>
                </div>
            )}
        </div>
    )
}