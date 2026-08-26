import { describe, it, expect, vi, afterEach } from 'vitest'
import { isStale, STALENESS_THRESHOLD_MS } from '@/utils/timeUtils'

describe('isStale', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns true when updatedAt is undefined', () => {
        expect(isStale(undefined)).toBe(true)
    })

    it('returns true when the reading is older than 45 minutes', () => {
        vi.useFakeTimers()
        const now = new Date('2024-06-15T12:00:00Z').getTime()
        vi.setSystemTime(now)

        // 46 minutes ago
        const oldTimestamp = new Date(now - STALENESS_THRESHOLD_MS - 60_000).toISOString()
        expect(isStale(oldTimestamp)).toBe(true)
    })

    it('returns false when the reading is less than 45 minutes old', () => {
        vi.useFakeTimers()
        const now = new Date('2024-06-15T12:00:00Z').getTime()
        vi.setSystemTime(now)

        // 30 minutes ago
        const recentTimestamp = new Date(now - 30 * 60 * 1000).toISOString()
        expect(isStale(recentTimestamp)).toBe(false)
    })

    it('returns false when the reading is exactly at the threshold boundary', () => {
        vi.useFakeTimers()
        const now = new Date('2024-06-15T12:00:00Z').getTime()
        vi.setSystemTime(now)

        // Exactly 45 minutes ago (at the boundary, not over)
        const boundaryTimestamp = new Date(now - STALENESS_THRESHOLD_MS).toISOString()
        expect(isStale(boundaryTimestamp)).toBe(false)
    })

    it('handles numeric timestamps', () => {
        vi.useFakeTimers()
        const now = new Date('2024-06-15T12:00:00Z').getTime()
        vi.setSystemTime(now)

        const oldNumericTimestamp = now - STALENESS_THRESHOLD_MS - 1000
        expect(isStale(oldNumericTimestamp)).toBe(true)

        const recentNumericTimestamp = now - 1000
        expect(isStale(recentNumericTimestamp)).toBe(false)
    })

    it('exports STALENESS_THRESHOLD_MS as 2700000 (45 minutes)', () => {
        expect(STALENESS_THRESHOLD_MS).toBe(2_700_000)
    })
})
