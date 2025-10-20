import { useRef, useEffect, useCallback } from 'react'
import { haptics } from '@/utils/haptics'

interface SwipeGestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  threshold?: number
  restoreScrollOnUp?: boolean
}

interface TouchState {
  startX: number
  startY: number
  startTime: number
  isDragging: boolean
}

export const useSwipeGestures = ({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
  restoreScrollOnUp = true
}: SwipeGestureOptions) => {
  const touchState = useRef<TouchState>({
    startX: 0,
    startY: 0,
    startTime: 0,
    isDragging: false
  })
  
  const elementRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    touchState.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      isDragging: true
    }
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!touchState.current.isDragging) return

    const touch = e.touches[0]
    const deltaX = touch.clientX - touchState.current.startX
    const deltaY = touch.clientY - touchState.current.startY
    
    // Prevent default scroll behavior only for intentional horizontal swipes
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
      e.preventDefault()
    }
  }, [])

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchState.current.isDragging) return
    
    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - touchState.current.startX
    const deltaY = touch.clientY - touchState.current.startY
    const deltaTime = Date.now() - touchState.current.startTime
    
    touchState.current.isDragging = false

    // Ignore if gesture took too long (probably not intentional)
    if (deltaTime > 500) return

    const absDeltaX = Math.abs(deltaX)
    const absDeltaY = Math.abs(deltaY)

    // Determine if this is primarily a horizontal or vertical gesture
    if (absDeltaX > absDeltaY && absDeltaX > threshold) {
      // Horizontal swipe
      if (deltaX > 0) {
        haptics.select()
        onSwipeRight?.()
      } else {
        haptics.select()
        onSwipeLeft?.()
      }
    } else if (absDeltaY > absDeltaX && absDeltaY > threshold) {
      // Vertical swipe
      if (deltaY > 0) {
        if (restoreScrollOnUp) {
          // Allow default scroll behavior for down swipes
          return
        }
        haptics.tap()
        onSwipeDown?.()
      } else {
        haptics.tap()
        onSwipeUp?.()
      }
    }
  }, [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold, restoreScrollOnUp])

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    // Add passive: false for touchmove to allow preventDefault
    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  return elementRef
}

export default useSwipeGestures