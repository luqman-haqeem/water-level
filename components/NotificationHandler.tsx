import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

import { BellRing } from "lucide-react";
import { Switch } from "@/components/ui/switch"
import useUserStore from '@/lib/store';

import { subscribeUser, unsubscribeUser } from '@/utils/oneSignalConfig';
import { checkNotificationPermission, requestNotificationPermission, saveUserPreferences, getUserPreferences, UserPreferences } from '@/utils/permissions';

interface NotificationHandlerProps {
    userId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const NotificationHandler: React.FC<NotificationHandlerProps> = ({ userId, open, onOpenChange }) => {
    const { isLoggedIn, isSubscribed, setIsSubscribed, user, login, logout } = useUserStore(); // 

    const [preferences, setPreferences] = useState<UserPreferences>({
        notifications: false,
        dailyUpdates: false,
        criticalAlerts: false,
    });

    useEffect(() => {
        loadUserPreferences();
    }, [isSubscribed]);

    const checkSubscriptionStatus = async (): Promise<void> => {
        const permission = await checkNotificationPermission();
        // console.log('permission', permission);
        setIsSubscribed(permission);
    };

    const loadUserPreferences = async (): Promise<void> => {
        const userPreferences = await getUserPreferences(userId);
        if (userPreferences) {
            setPreferences(userPreferences);
        }
    };

    const handleSubscribe = async (): Promise<void> => {

        const permission = await requestNotificationPermission() ?? true;

        if (permission) {
            await subscribeUser(userId);
            // console.log('request permission', permission);

            setIsSubscribed(permission);
            // await logSubscriptionChange(true);
            await saveUserPreferences(userId, { ...preferences, notifications: true });
        }
    };

    const handleUnsubscribe = async (): Promise<void> => {
        await unsubscribeUser();
        setIsSubscribed(false);
        // await logSubscriptionChange(false);
        await saveUserPreferences(userId, { ...preferences, notifications: false });
    };

    const handleSwitchChange = async (checked: boolean): Promise<void> => {
        if (checked) {
            await handleSubscribe();
        } else {
            await handleUnsubscribe();
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent >
                <DialogHeader>
                    <DialogTitle>Notification Settings</DialogTitle>
                    <DialogDescription>Manage your notification preferences</DialogDescription>
                </DialogHeader>
                <div>
                    <div className="flex items-center space-x-4 rounded-md border p-4">
                        <BellRing />
                        <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium leading-none">
                                Push Notifications
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Send notifications to device.
                            </p>
                        </div>
                        <Switch checked={isSubscribed} onCheckedChange={handleSwitchChange} />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default NotificationHandler;