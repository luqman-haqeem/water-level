// Haptic feedback utilities for mobile interactions
// Uses the Vibration API (supported on Android and some iOS browsers)

export type HapticType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error'

class HapticEngine {
  private isSupported: boolean = false

  constructor() {
    if (typeof window !== 'undefined') {
      this.isSupported = 'navigator' in window && 'vibrate' in navigator
    }
  }

  /**
   * Trigger haptic feedback via the Vibration API.
   */
  trigger(type: HapticType = 'light'): void {
    if (!this.isSupported) return

    try {
      const pattern = this.getVibrationPattern(type)
      navigator.vibrate(pattern)
    } catch {
      // Silently fail — haptic feedback is nice-to-have
    }
  }

  private getVibrationPattern(type: HapticType): number | number[] {
    switch (type) {
      case 'light':
        return 10
      case 'medium':
        return 20
      case 'heavy':
        return 50
      case 'selection':
        return 15
      case 'success':
        return [20, 10, 20]
      case 'warning':
        return [30, 20, 30]
      case 'error':
        return [50, 30, 50, 30, 50]
      default:
        return 10
    }
  }

  isHapticSupported(): boolean {
    return this.isSupported
  }
}

// Singleton instance
const hapticEngine = new HapticEngine()

export const triggerHaptic = (type: HapticType = 'light'): void => {
  hapticEngine.trigger(type)
}

export const isHapticSupported = (): boolean => {
  return hapticEngine.isHapticSupported()
}

/**
 * Convenience functions for common interactions
 */
export const haptics = {
  tap: () => triggerHaptic('light'),
  press: () => triggerHaptic('medium'),
  impact: () => triggerHaptic('heavy'),
  select: () => triggerHaptic('selection'),
  success: () => triggerHaptic('success'),
  warning: () => triggerHaptic('warning'),
  error: () => triggerHaptic('error'),
  custom: (type: HapticType) => triggerHaptic(type),
}
