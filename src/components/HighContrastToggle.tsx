import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

export function HighContrastToggle() {
  const [highContrast, setHighContrast] = useState(false)

  useEffect(() => {
    // Check for saved preference or system preference
    const savedMode = localStorage.getItem('high-contrast-mode')
    const preferHighContrast = savedMode === 'true' || 
      window.matchMedia('(prefers-contrast: high)').matches

    if (preferHighContrast) {
      setHighContrast(true)
      document.documentElement.classList.add('high-contrast')
    }
  }, [])

  const toggleHighContrast = () => {
    const newMode = !highContrast
    setHighContrast(newMode)
    
    if (newMode) {
      document.documentElement.classList.add('high-contrast')
      localStorage.setItem('high-contrast-mode', 'true')
    } else {
      document.documentElement.classList.remove('high-contrast')
      localStorage.setItem('high-contrast-mode', 'false')
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleHighContrast}
      className={cn(
        "min-w-touch min-h-touch",
        highContrast && "bg-high-contrast-fg text-high-contrast-bg"
      )}
      title={`${highContrast ? 'Disable' : 'Enable'} high contrast mode`}
    >
      <Eye className={cn(
        "h-5 w-5 transition-colors",
        highContrast && "text-high-contrast-bg"
      )} />
      <span className="sr-only">
        {highContrast ? 'Disable' : 'Enable'} high contrast mode
      </span>
    </Button>
  )
}