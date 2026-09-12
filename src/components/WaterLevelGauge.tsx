import { cn } from '@/lib/utils'
import { AlertTriangle, Droplets } from 'lucide-react'

interface WaterLevel {
  /** null = JPS publishes no threshold for this station (#73). */
  normal: number | null
  alert: number | null
  warning: number | null
  danger: number | null
}

interface WaterLevelGaugeProps {
  currentLevel: number
  levels: WaterLevel
  stationName?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
  orientation?: 'vertical' | 'horizontal'
  showLabels?: boolean
  showCurrentValue?: boolean
  animated?: boolean
}

export default function WaterLevelGauge({
  currentLevel,
  levels,
  stationName,
  className,
  size = 'md',
  orientation = 'vertical',
  showLabels = true,
  showCurrentValue = true,
  animated = true
}: WaterLevelGaugeProps) {
  // The whole gauge is scaled off the danger threshold, so without it there is
  // nothing honest to draw. Previously `danger` arrived as 0 for these stations,
  // which made every zone collapse and every reading read as Danger (#73).
  const danger = levels.danger
  if (danger === null) {
    return (
      <div className={cn("space-y-2", className)}>
        {(stationName || showCurrentValue) && (
          <div className="flex items-center justify-between">
            {stationName && (
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Droplets className="w-4 h-4 text-water-blue" />
                {stationName}
              </h4>
            )}
            {showCurrentValue && (
              <span className="text-lg font-bold text-foreground">
                {currentLevel.toFixed(1)}m
              </span>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          JPS publishes no threshold levels for this station, so this reading
          cannot be placed on a scale.
        </p>
      </div>
    )
  }

  // Calculate the maximum height for the gauge
  const maxLevel = Math.max(danger * 1.2, currentLevel * 1.1)

  // Calculate percentages for each level. Absent thresholds collapse onto the
  // next one up rather than to 0, so a missing band renders as no band instead
  // of a band that falsely starts at zero.
  const pct = (value: number) => (value / maxLevel) * 100
  const dangerPercent = pct(danger)
  const warningPercent = levels.warning !== null ? pct(levels.warning) : dangerPercent
  const alertPercent = levels.alert !== null ? pct(levels.alert) : warningPercent
  const normalPercent = levels.normal !== null ? pct(levels.normal) : 0
  const currentPercent = Math.min((currentLevel / maxLevel) * 100, 100)

  // Determine current alert level, comparing only against thresholds we have.
  const getCurrentAlertLevel = () => {
    if (currentLevel >= danger) return { level: 3, name: 'Danger', color: 'bg-danger', icon: '🔴' }
    if (levels.warning !== null && currentLevel >= levels.warning) return { level: 2, name: 'Warning', color: 'bg-warning', icon: '🟡' }
    if (levels.alert !== null && currentLevel >= levels.alert) return { level: 1, name: 'Alert', color: 'bg-alert', icon: '🟠' }
    return { level: 0, name: 'Normal', color: 'bg-normal', icon: '🟢' }
  }

  const currentAlert = getCurrentAlertLevel()

  const sizeClasses = {
    sm: orientation === 'vertical' ? 'w-8 h-24' : 'w-24 h-8',
    md: orientation === 'vertical' ? 'w-12 h-32' : 'w-32 h-12',
    lg: orientation === 'vertical' ? 'w-16 h-40' : 'w-40 h-16'
  }

  const LevelMarker = ({ percent, label, color, value }: { percent: number, label: string, color: string, value: number | null }) => {
    if (value === null) return null
    if (orientation === 'vertical') {
      return (
        <div 
          className="absolute w-full flex items-center"
          style={{ bottom: `${percent}%` }}
        >
          <div className={cn("h-0.5 w-full", color)} />
          {showLabels && (
            <div className="absolute left-full ml-2 text-xs whitespace-nowrap flex items-center gap-1">
              <span className="font-medium">{label}</span>
              <span className="text-muted-foreground">{value}m</span>
            </div>
          )}
        </div>
      )
    } else {
      return (
        <div 
          className="absolute h-full flex items-center"
          style={{ left: `${percent}%` }}
        >
          <div className={cn("w-0.5 h-full", color)} />
          {showLabels && (
            <div className="absolute top-full mt-1 text-xs whitespace-nowrap flex flex-col items-center">
              <span className="font-medium">{label}</span>
              <span className="text-muted-foreground">{value}m</span>
            </div>
          )}
        </div>
      )
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      {(stationName || showCurrentValue) && (
        <div className="flex items-center justify-between">
          {stationName && (
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Droplets className="w-4 h-4 text-water-blue" />
              {stationName}
            </h4>
          )}
          {showCurrentValue && (
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-foreground">
                {currentLevel.toFixed(1)}m
              </span>
              <div className="flex items-center gap-1">
                <span role="img" aria-label={currentAlert.name}>
                  {currentAlert.icon}
                </span>
                <span className="text-xs font-medium">{currentAlert.name}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gauge Container */}
      <div className="relative">
        {/* Main Gauge */}
        <div 
          className={cn(
            "relative border-2 border-border rounded-lg overflow-hidden bg-muted/30",
            sizeClasses[size]
          )}
        >
          {/* Background zones */}
          <div className="absolute inset-0">
            {/* Danger zone */}
            <div 
              className="absolute bg-danger/20 border-t border-danger/30"
              style={
                orientation === 'vertical' 
                  ? { bottom: `${dangerPercent}%`, height: `${100 - dangerPercent}%` }
                  : { left: `${dangerPercent}%`, width: `${100 - dangerPercent}%` }
              }
            />
            {/* Warning zone */}
            <div 
              className="absolute bg-warning/20 border-t border-warning/30"
              style={
                orientation === 'vertical' 
                  ? { bottom: `${warningPercent}%`, height: `${dangerPercent - warningPercent}%` }
                  : { left: `${warningPercent}%`, width: `${dangerPercent - warningPercent}%` }
              }
            />
            {/* Alert zone */}
            <div 
              className="absolute bg-alert/20 border-t border-alert/30"
              style={
                orientation === 'vertical' 
                  ? { bottom: `${alertPercent}%`, height: `${warningPercent - alertPercent}%` }
                  : { left: `${alertPercent}%`, width: `${warningPercent - alertPercent}%` }
              }
            />
            {/* Normal zone */}
            <div 
              className="absolute bg-normal/20"
              style={
                orientation === 'vertical' 
                  ? { bottom: 0, height: `${alertPercent}%` }
                  : { left: 0, width: `${alertPercent}%` }
              }
            />
          </div>

          {/* Current water level indicator */}
          <div 
            className={cn(
              "absolute transition-all duration-1000 ease-out z-10",
              currentAlert.color,
              orientation === 'vertical' ? "w-full h-1" : "h-full w-1",
              animated && currentLevel >= danger && "animate-pulse"
            )}
            style={
              orientation === 'vertical' 
                ? { bottom: `${currentPercent}%` }
                : { left: `${currentPercent}%` }
            }
          >
            {/* Water level fill */}
            <div 
              className={cn(
                "absolute bg-water-blue/60 backdrop-blur-sm",
                orientation === 'vertical' 
                  ? "inset-x-0 bottom-0" 
                  : "inset-y-0 left-0",
                animated && currentLevel >= danger && "animate-pulse"
              )}
              style={
                orientation === 'vertical' 
                  ? { height: `${currentPercent * 4}px` }
                  : { width: `${currentPercent * 4}px` }
              }
            />
          </div>

          {/* Level markers */}
          <LevelMarker 
            percent={dangerPercent} 
            label="Danger" 
            color="bg-danger" 
            value={levels.danger} 
          />
          <LevelMarker 
            percent={warningPercent} 
            label="Warning" 
            color="bg-warning" 
            value={levels.warning} 
          />
          <LevelMarker 
            percent={alertPercent} 
            label="Alert" 
            color="bg-alert" 
            value={levels.alert} 
          />
          <LevelMarker 
            percent={normalPercent} 
            label="Normal" 
            color="bg-normal" 
            value={levels.normal} 
          />
        </div>

        {/* Critical level warning */}
        {currentAlert.level >= 2 && (
          <div className="absolute -top-1 -right-1 animate-bounce">
            <AlertTriangle className="w-4 h-4 text-warning fill-warning/20" />
          </div>
        )}
      </div>

      {/* Legend (for horizontal orientation) */}
      {orientation === 'horizontal' && showLabels && (
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="text-center">Water Level Gauge (meters)</div>
        </div>
      )}
    </div>
  )
}