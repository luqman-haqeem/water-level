import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCapture = vi.fn()
vi.mock('posthog-js', () => ({ default: { capture: (...a: unknown[]) => mockCapture(...a) } }))

import { track, trackAlertOpenFromUrl } from '@/lib/analytics'

describe('track', () => {
    beforeEach(() => { mockCapture.mockReset() })

    it('forwards to posthog.capture', () => {
        track('location_granted', {})
        expect(mockCapture).toHaveBeenCalledWith('location_granted', {})
    })

    it('never throws when posthog does', () => {
        mockCapture.mockImplementation(() => { throw new Error('boom') })
        expect(() => track('location_granted', {})).not.toThrow()
    })
})

describe('trackAlertOpenFromUrl', () => {
    beforeEach(() => { mockCapture.mockReset() })

    it('fires alert_opened with level and minutes since sent, then strips the params', () => {
        const sent = 1_700_000_000_000
        window.history.replaceState(null, '', `/stations/abc?src=alert&level=3&sent=${sent}&keep=1`)

        trackAlertOpenFromUrl('abc', sent + 7 * 60_000 + 20_000)

        expect(mockCapture).toHaveBeenCalledWith('alert_opened', {
            stationId: 'abc',
            alertLevel: 3,
            minsSinceSent: 7,
        })
        expect(window.location.pathname + window.location.search).toBe('/stations/abc?keep=1')
    })

    it('uses null for missing level/sent', () => {
        window.history.replaceState(null, '', '/stations/abc?src=alert')

        trackAlertOpenFromUrl('abc')

        expect(mockCapture).toHaveBeenCalledWith('alert_opened', {
            stationId: 'abc',
            alertLevel: null,
            minsSinceSent: null,
        })
    })

    it('does nothing for a normal visit', () => {
        window.history.replaceState(null, '', '/stations/abc')

        trackAlertOpenFromUrl('abc')

        expect(mockCapture).not.toHaveBeenCalled()
    })
})
