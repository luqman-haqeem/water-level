import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    getSubscribedStations,
    unsubscribeFromStation,
} from "@/services/notificationService";
import type { SubscribedStation } from "@/services/notificationService";

interface NotificationHandlerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function NotificationHandler({
    open,
    onOpenChange,
}: NotificationHandlerProps) {
    const [stations, setStations] = useState<SubscribedStation[]>([]);

    useEffect(() => {
        if (open) {
            setStations(getSubscribedStations());
        }
    }, [open]);

    const handleUnsubscribe = async (stationId: string) => {
        await unsubscribeFromStation(stationId);
        setStations(getSubscribedStations());
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Station Notifications</DialogTitle>
                    <DialogDescription>
                        Manage your per-station push notification subscriptions.
                        You will receive alerts when subscribed stations reach
                        danger levels.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2">
                    {stations.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            No stations subscribed
                        </p>
                    ) : (
                        stations.map((station) => (
                            <div
                                key={station.id}
                                className="flex items-center justify-between p-2 rounded-md border border-border"
                            >
                                <span className="text-sm">
                                    {station.name}
                                </span>
                                <button
                                    type="button"
                                    aria-label="Unsubscribe"
                                    onClick={() =>
                                        handleUnsubscribe(station.id)
                                    }
                                    className="text-xs text-destructive hover:text-destructive/80 px-2 py-1 rounded"
                                >
                                    Unsubscribe
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
