import React from 'react'
import { RefreshIcon } from '@/components/icons/IconLibrary'
import { cn } from '@/lib/utils'

interface PullToRefreshIndicatorProps {
  isVisible: boolean
  isRefreshing: boolean
  progress: number
  yOffset: number
}

export default function PullToRefreshIndicator({
  isVisible,
  isRefreshing,
  progress,
  yOffset
}: PullToRefreshIndicatorProps) {
  if (!isVisible) return null

  return (
    <div
      className="absolute left-0 right-0 flex items-center justify-center z-30 pointer-events-none transition-transform duration-200 ease-out"
      style={{
        top: yOffset,
        transform: `translateY(-100%)`
      }}
    >
      <div className="bg-background/95 backdrop-blur-sm rounded-full p-3 shadow-lg border border-border/20">
        <div
          className={cn(
            "text-muted-foreground transition-all duration-200",
            isRefreshing && "animate-spin",
            progress >= 1 && !isRefreshing && "text-primary"
          )}
          style={{
            transform: `rotate(${progress * 360}deg)`
          }}
        >
          <RefreshIcon size="md" />
        </div>
      </div>
    </div>
  )
}