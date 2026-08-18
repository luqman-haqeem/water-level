import { useState, useEffect } from "react";
import OneSignal from "react-onesignal";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Module-level flag to prevent re-initialization across mounts
let oneSignalInitialized = false;

interface NotificationHandlerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function NotificationHandler({
    open,
    onOpenChange,
}: NotificationHandlerProps) {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isInitialized, setIsInitialized] = useState(oneSignalInitialized);

    const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;

    useEffect(() => {
        if (!appId) {
            setIsLoading(false);
            return;
        }

        const initOneSignal = async () => {
            try {
                if (!oneSignalInitialized) {
                    await OneSignal.init({ appId });
                    oneSignalInitialized = true;
                }
                setIsInitialized(true);
                const optedIn = OneSignal.User.PushSubscription.optedIn;
                setIsSubscribed(optedIn ?? false);
            } catch (error) {
                console.error("Failed to initialize OneSignal:", error);
            } finally {
                setIsLoading(false);
            }
        };

        initOneSignal();

        const handleSubscriptionChange = () => {
            const optedIn = OneSignal.User.PushSubscription.optedIn;
            setIsSubscribed(optedIn ?? false);
        };

        OneSignal.User.PushSubscription.addEventListener(
            "change",
            handleSubscriptionChange
        );

        return () => {
            OneSignal.User.PushSubscription.removeEventListener(
                "change",
                handleSubscriptionChange
            );
        };
    }, [appId]);

    const handleToggle = async (checked: boolean) => {
        if (!isInitialized) return;

        setIsLoading(true);
        try {
            if (checked) {
                await OneSignal.User.PushSubscription.optIn();
            } else {
                await OneSignal.User.PushSubscription.optOut();
            }
            setIsSubscribed(checked);
        } catch (error) {
            console.error("Failed to update subscription:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Push Notifications</DialogTitle>
                    <DialogDescription>
                        Enable push notifications to receive alerts when water
                        stations reach danger levels. Notifications are sent to
                        this browser when any monitored station enters a
                        dangerous state.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex items-center justify-between py-4">
                    {!appId ? (
                        <p className="text-sm text-muted-foreground">
                            Push notifications are not configured for this
                            environment.
                        </p>
                    ) : (
                        <>
                            <Label
                                htmlFor="notification-toggle"
                                className="flex-1"
                            >
                                Danger level alerts
                            </Label>
                            <Switch
                                id="notification-toggle"
                                checked={isSubscribed}
                                onCheckedChange={handleToggle}
                                disabled={isLoading || !isInitialized}
                            />
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
