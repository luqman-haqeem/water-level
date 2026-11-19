/**
 * Can this device actually receive a web push?
 *
 * iOS only delivers web push to a PWA launched from the Home Screen — never
 * to a Safari (or any iOS browser) tab. Without this check an iPhone user can
 * tap the bell, see "subscribed", and receive nothing: the worst failure this
 * product can have.
 */
export type PushSupport = "supported" | "ios-install-required" | "unsupported";

export function isIos(nav: Navigator = navigator): boolean {
    if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true;
    // iPadOS 13+ reports itself as a Mac; touch support gives it away.
    return nav.platform === "MacIntel" && nav.maxTouchPoints > 1;
}

export function isStandalone(win: Window = window): boolean {
    const nav = win.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
    return typeof win.matchMedia === "function"
        && win.matchMedia("(display-mode: standalone)").matches;
}

export function getPushSupport(win: Window = window): PushSupport {
    if (isIos(win.navigator) && !isStandalone(win)) return "ios-install-required";
    if (
        !("Notification" in win) ||
        !("serviceWorker" in win.navigator) ||
        !("PushManager" in win)
    ) {
        return "unsupported";
    }
    return "supported";
}

/**
 * True only when push can be delivered right now: the platform supports it
 * and the user has granted permission. Used to stop the UI claiming a
 * subscription that cannot fire.
 */
export function canReceivePush(win: Window = window): boolean {
    return getPushSupport(win) === "supported"
        && (win as Window & { Notification: typeof Notification }).Notification.permission === "granted";
}
