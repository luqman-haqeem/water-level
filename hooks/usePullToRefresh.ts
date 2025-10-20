import { useRef, useEffect, useCallback, useState } from 'react'
import { haptics } from '@/utils/haptics'

interface PullToRefreshOptions {
  onRefresh: () => Promise<void> | void
  threshold?: number
  loadingIndicatorHeight?: number
}

export const usePullToRefresh = ({
  onRefresh,
  threshold = 80,
  loadingIndicatorHeight = 60
}: PullToRefreshOptions) => {
  const [isPulling, setIsPulling] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef<number>(0)
  const lastTouchY = useRef<number>(0)
  const isAtTop = useRef<boolean>(false)

  const checkIfAtTop = useCallback(() => {
    const container = containerRef.current
    if (!container) return false
    
    // Check if we're at the top of the scrollable container
    return container.scrollTop === 0
  }, [])

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    touchStartY.current = touch.clientY
    lastTouchY.current = touch.clientY
    isAtTop.current = checkIfAtTop()
  }, [checkIfAtTop])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isAtTop.current || isRefreshing) return

    const touch = e.touches[0]
    const currentY = touch.clientY
    const deltaY = currentY - touchStartY.current

    // Only handle downward pull when at top
    if (deltaY > 0) {
      const pullAmount = Math.min(deltaY * 0.5, threshold * 1.5) // Damping effect
      setPullDistance(pullAmount)
      
      if (pullAmount > 10) {
        setIsPulling(true)
        e.preventDefault() // Prevent default scroll
      }

      // Haptic feedback when threshold is reached
      if (pullAmount >= threshold && lastTouchY.current < currentY) {
        haptics.tap()
      }
    }

    lastTouchY.current = currentY
  }, [threshold, isRefreshing, checkIfAtTop])

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling || isRefreshing) {
      setIsPulling(false)
      setPullDistance(0)
      return
    }

    if (pullDistance >= threshold) {
      // Trigger refresh
      setIsRefreshing(true)
      haptics.select()
      
      try {
        await onRefresh()
      } catch (error) {
        console.error('Pull-to-refresh failed:', error)
      }
      
      // Keep spinner visible for minimum duration for better UX
      setTimeout(() => {
        setIsRefreshing(false)
        setIsPulling(false)
        setPullDistance(0)
      }, 500)
    } else {
      // Snap back if threshold not reached
      setIsPulling(false)
      setPullDistance(0)
    }
  }, [isPulling, isRefreshing, pullDistance, threshold, onRefresh])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Use passive: false for touchmove to allow preventDefault
    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  // Calculate refresh indicator state
  const refreshProgress = Math.min(pullDistance / threshold, 1)
  const shouldShowIndicator = isPulling || isRefreshing
  const indicatorY = isRefreshing ? loadingIndicatorHeight : Math.max(0, pullDistance - loadingIndicatorHeight)

  return {
    containerRef,
    isPulling,
    isRefreshing,
    pullDistance,
    refreshProgress,
    shouldShowIndicator,
    indicatorY
  }
}

export default usePullToRefresh