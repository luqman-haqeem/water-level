import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Displays a persistent banner when the app is offline.
 * Informs users that data may be stale and will update when reconnected.
 * Critical for flood monitoring — users need to know if they're seeing cached data.
 */
export function OfflineBanner() {
    const isOnline = useOnlineStatus();

    if (isOnline) return null;

    return (
        <div className="bg-warning/90 text-warning-foreground px-4 py-2 text-center text-sm font-medium sticky top-0 z-50 backdrop-blur-sm">
            <span className="inline-flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning-foreground/70 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-warning-foreground" />
                </span>
                You&apos;re offline — showing cached data. Will update when reconnected.
            </span>
        </div>
    );
}
