import React, { useState, useRef, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { cn } from '@/lib/utils'
import { haptics } from '@/utils/haptics'
import { ChevronDownIcon, ChevronUpIcon } from '@/components/icons/IconLibrary'

interface ExpandableSectionProps {
  title: string
  children: React.ReactNode
  defaultExpanded?: boolean
  icon?: React.ReactNode
  variant?: 'default' | 'compact' | 'card'
  className?: string
  titleClassName?: string
  contentClassName?: string
  animationDuration?: number
}

export default function ExpandableSection({
  title,
  children,
  defaultExpanded = false,
  icon,
  variant = 'default',
  className,
  titleClassName,
  contentClassName,
  animationDuration = 200
}: ExpandableSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [contentHeight, setContentHeight] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>()

  // Measure content height when expanded or content changes
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight)
    }
  }, [children, isExpanded])

  // Handle expansion with smooth animation
  const handleToggle = () => {
    haptics.tap()
    
    // Cancel any ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }

    setIsExpanded(prev => !prev)
  }

  // Variant-specific styling
  const getVariantClasses = () => {
    switch (variant) {
      case 'compact':
        return {
          container: 'space-y-2',
          header: 'py-2',
          content: 'pl-4'
        }
      case 'card':
        return {
          container: 'border border-border/50 rounded-lg bg-card theme-transition-colors',
          header: 'p-4 border-b border-border/50',
          content: 'p-4'
        }
      default:
        return {
          container: 'space-y-3',
          header: 'py-3',
          content: 'pl-6'
        }
    }
  }

  const variantClasses = getVariantClasses()

  return (
    <div className={cn(variantClasses.container, className)}>
      {/* Header */}
      <div className={cn(variantClasses.header, titleClassName)}>
        <Button
          variant="ghost"
          onClick={handleToggle}
          className="w-full justify-between p-0 h-auto font-medium hover:bg-transparent"
        >
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-left">{title}</span>
          </div>
          <div className="flex-shrink-0">
            {isExpanded ? (
              <ChevronUpIcon size="sm" />
            ) : (
              <ChevronDownIcon size="sm" />
            )}
          </div>
        </Button>
      </div>

      {/* Expandable Content */}
      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{
          height: isExpanded ? `${contentHeight}px` : '0px',
          opacity: isExpanded ? 1 : 0
        }}
      >
        <div
          ref={contentRef}
          className={cn(variantClasses.content, contentClassName)}
        >
          {children}
        </div>
      </div>
    </div>
  )
}