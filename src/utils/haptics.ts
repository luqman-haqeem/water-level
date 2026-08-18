// Haptic feedback utilities for mobile interactions
// Note: This will only work on supported devices and browsers

export type HapticType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error'

class HapticEngine {
  private isSupported: boolean = false
  private isIOS: boolean = false
  private isAndroid: boolean = false

  constructor() {
    if (typeof window !== 'undefined') {
      // Check for browser support
      this.isSupported = 'navigator' in window && 'vibrate' in navigator
      
      // Detect platform
      const userAgent = navigator.userAgent.toLowerCase()
      this.isIOS = /iphone|ipad|ipod/.test(userAgent)
      this.isAndroid = /android/.test(userAgent)

      // iOS supports Haptic Feedback API in modern browsers
      if (this.isIOS && 'DeviceMotionEvent' in window) {
        this.isSupported = true
      }
    }
  }

  /**
   * Trigger haptic feedback
   */
  trigger(type: HapticType = 'light'): void {
    if (!this.isSupported) return

    try {
      if (this.isIOS) {
        // iOS Haptic Feedback (if available)
        this.triggerIOSHaptic(type)
      } else if (this.isAndroid) {
        // Android Vibration API
        this.triggerAndroidVibration(type)
      } else {
        // Fallback to basic vibration
        this.triggerBasicVibration(type)
      }
    } catch (error) {
      // Silently fail - haptic feedback is nice-to-have
      console.debug('Haptic feedback failed:', error)
    }
  }

  private triggerIOSHaptic(type: HapticType): void {
    // iOS devices with modern browsers support this
    if ('navigator' in window && 'vibrate' in navigator) {
      const patterns = this.getVibrationPattern(type)
      navigator.vibrate(patterns)
    }
  }

  private triggerAndroidVibration(type: HapticType): void {
    if ('navigator' in window && 'vibrate' in navigator) {
      const patterns = this.getVibrationPattern(type)
      navigator.vibrate(patterns)
    }
  }

  private triggerBasicVibration(type: HapticType): void {
    if ('navigator' in window && 'vibrate' in navigator) {
      const patterns = this.getVibrationPattern(type)
      navigator.vibrate(patterns)
    }
  }

  private getVibrationPattern(type: HapticType): number | number[] {
    switch (type) {
      case 'light':
        return 10 // Very light tap
      case 'medium':
        return 20 // Medium tap
      case 'heavy':
        return 50 // Strong tap
      case 'selection':
        return 15 // Selection feedback
      case 'success':
        return [20, 10, 20] // Double tap for success
      case 'warning':
        return [30, 20, 30] // Warning pattern
      case 'error':
        return [50, 30, 50, 30, 50] // Strong error pattern
      default:
        return 10
    }
  }

  /**
   * Check if haptic feedback is supported on this device
   */
  isHapticSupported(): boolean {
    return this.isSupported
  }
}

// Create singleton instance
const hapticEngine = new HapticEngine()

/**
 * Trigger haptic feedback
 * @param type - Type of haptic feedback
 */
export const triggerHaptic = (type: HapticType = 'light'): void => {
  hapticEngine.trigger(type)
}

/**
 * Check if haptic feedback is supported
 */
export const isHapticSupported = (): boolean => {
  return hapticEngine.isHapticSupported()
}

/**
 * Convenience functions for common interactions
 */
export const haptics = {
  // UI interactions
  tap: () => triggerHaptic('light'),
  press: () => triggerHaptic('medium'),
  impact: () => triggerHaptic('heavy'),
  
  // Selection and navigation
  select: () => triggerHaptic('selection'),
  
  // Feedback states
  success: () => triggerHaptic('success'),
  warning: () => triggerHaptic('warning'),
  error: () => triggerHaptic('error'),
  
  // Custom
  custom: (type: HapticType) => triggerHaptic(type)
}