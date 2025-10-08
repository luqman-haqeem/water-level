/**
 * Enhanced theme utilities for better dark/light mode transitions
 * Includes system preference detection and smooth theme switching
 */

export type Theme = 'light' | 'dark' | 'system'

/**
 * Detect system theme preference
 */
export const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

/**
 * Apply theme with smooth transition
 */
export const applyTheme = (theme: Theme): void => {
  if (typeof window === 'undefined') return
  
  const root = document.documentElement
  const actualTheme = theme === 'system' ? getSystemTheme() : theme
  
  // Add transition class before changing theme
  root.classList.add('theme-transitioning')
  
  // Apply theme
  if (actualTheme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  
  // Remove transition class after animation completes
  setTimeout(() => {
    root.classList.remove('theme-transitioning')
  }, 300)
}

/**
 * Listen for system theme changes
 */
export const watchSystemTheme = (callback: (theme: 'light' | 'dark') => void): (() => void) => {
  if (typeof window === 'undefined') return () => {}
  
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  
  const handler = (e: MediaQueryListEvent) => {
    callback(e.matches ? 'dark' : 'light')
  }
  
  mediaQuery.addEventListener('change', handler)
  
  // Return cleanup function
  return () => {
    mediaQuery.removeEventListener('change', handler)
  }
}

/**
 * Get the next theme in rotation (light -> dark -> system -> light)
 */
export const getNextTheme = (current: Theme): Theme => {
  switch (current) {
    case 'light': return 'dark'
    case 'dark': return 'system'
    case 'system': return 'light'
    default: return 'light'
  }
}

/**
 * Get theme display name
 */
export const getThemeDisplayName = (theme: Theme): string => {
  switch (theme) {
    case 'light': return 'Light Mode'
    case 'dark': return 'Dark Mode'
    case 'system': return 'System Default'
    default: return 'Light Mode'
  }
}

/**
 * Check if user prefers reduced motion
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}