import { describe, it, expect } from 'vitest'
import { canReceivePush, getPushSupport, isIos } from '@/utils/pushSupport'

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36'

interface FakeOpts {
    ua: string
    platform?: string
    maxTouchPoints?: number
    standalone?: boolean
    displayModeStandalone?: boolean
    push?: boolean
    permission?: NotificationPermission
}

function fakeWindow(o: FakeOpts): Window {
    const navigator: Record<string, unknown> = {
        userAgent: o.ua,
        platform: o.platform ?? '',
        maxTouchPoints: o.maxTouchPoints ?? 0,
    }
    if (o.standalone !== undefined) navigator.standalone = o.standalone
    const win: Record<string, unknown> = {
        navigator,
        matchMedia: (q: string) => ({ matches: q === '(display-mode: standalone)' && !!o.displayModeStandalone }),
    }
    if (o.push !== false) {
        navigator.serviceWorker = {}
        win.PushManager = function PushManager() {}
        win.Notification = { permission: o.permission ?? 'default' }
    }
    return win as unknown as Window
}

describe('isIos', () => {
    it('detects iPhone', () => {
        expect(isIos(fakeWindow({ ua: IPHONE_UA }).navigator)).toBe(true)
    })

    it('detects iPadOS reporting as a Mac via touch points', () => {
        expect(isIos(fakeWindow({ ua: MAC_UA, platform: 'MacIntel', maxTouchPoints: 5 }).navigator)).toBe(true)
    })

    it('does not flag a real Mac or Android', () => {
        expect(isIos(fakeWindow({ ua: MAC_UA, platform: 'MacIntel' }).navigator)).toBe(false)
        expect(isIos(fakeWindow({ ua: ANDROID_UA, platform: 'Linux armv8l', maxTouchPoints: 5 }).navigator)).toBe(false)
    })
})

describe('getPushSupport', () => {
    it('requires install for an iOS browser tab, even when push APIs exist', () => {
        expect(getPushSupport(fakeWindow({ ua: IPHONE_UA }))).toBe('ios-install-required')
    })

    it('supports an iOS Home Screen app (display-mode: standalone)', () => {
        expect(getPushSupport(fakeWindow({ ua: IPHONE_UA, displayModeStandalone: true }))).toBe('supported')
    })

    it('supports an iOS Home Screen app (navigator.standalone)', () => {
        expect(getPushSupport(fakeWindow({ ua: IPHONE_UA, standalone: true }))).toBe('supported')
    })

    it('is unsupported without push APIs', () => {
        expect(getPushSupport(fakeWindow({ ua: ANDROID_UA, push: false }))).toBe('unsupported')
    })

    it('supports Android Chrome in a tab', () => {
        expect(getPushSupport(fakeWindow({ ua: ANDROID_UA }))).toBe('supported')
    })
})

describe('canReceivePush', () => {
    it('is true only when supported and permission is granted', () => {
        expect(canReceivePush(fakeWindow({ ua: ANDROID_UA, permission: 'granted' }))).toBe(true)
        expect(canReceivePush(fakeWindow({ ua: ANDROID_UA, permission: 'default' }))).toBe(false)
        expect(canReceivePush(fakeWindow({ ua: ANDROID_UA, permission: 'denied' }))).toBe(false)
    })

    it('is false in an iOS tab even with granted permission', () => {
        expect(canReceivePush(fakeWindow({ ua: IPHONE_UA, permission: 'granted' }))).toBe(false)
    })
})
