// PWA "Add to Home Screen" install-prompt capture.
//
// Chromium fires `beforeinstallprompt` early and only once. If the listener is
// attached after that event fires (e.g. only once an overlay component mounts),
// the interactive install button never appears. To avoid that, this module
// registers the listener at import time (imported early from main.tsx) so the
// event is stashed before any UI mounts. Components read the cached event via
// getInstallPromptEvent() and subscribe for events that fire later.

export interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let cachedEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(event: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (event: Event) => {
        event.preventDefault();
        cachedEvent = event as BeforeInstallPromptEvent;
        listeners.forEach((listener) => listener(cachedEvent));
    });

    // Once installed, the cached prompt is no longer usable.
    window.addEventListener("appinstalled", () => {
        cachedEvent = null;
        listeners.forEach((listener) => listener(null));
    });
}

/** Returns the most recently captured install-prompt event, if any. */
export function getInstallPromptEvent(): BeforeInstallPromptEvent | null {
    return cachedEvent;
}

/** Clears the cached event (e.g. after the prompt has been shown). */
export function clearInstallPromptEvent(): void {
    cachedEvent = null;
}

/**
 * Subscribe to changes in the captured install-prompt event. The callback is
 * invoked when a new `beforeinstallprompt` fires or the app is installed.
 * Returns an unsubscribe function.
 */
export function subscribeInstallPrompt(
    listener: (event: BeforeInstallPromptEvent | null) => void
): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** True when the app is already running as an installed/standalone PWA. */
export function isRunningStandalone(): boolean {
    if (typeof window === "undefined") return false;
    const displayModeStandalone = window.matchMedia(
        "(display-mode: standalone)"
    ).matches;
    const iosStandalone =
        (navigator as unknown as { standalone?: boolean }).standalone === true;
    return displayModeStandalone || iosStandalone;
}
