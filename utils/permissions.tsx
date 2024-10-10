// utils/permissions.ts

import OneSignal from 'react-onesignal';
import { promptForNotificationPermission } from './oneSignalConfig';

export interface UserPreferences {
    notifications: boolean;
    dailyUpdates: boolean;
    criticalAlerts: boolean;
}

export const checkNotificationPermission = async () => {
    const permission = OneSignal.Notifications.permission;
    return permission;
};

export const requestNotificationPermission = async () => {
    try {
        const result = await promptForNotificationPermission();
        return result;
    } catch (error) {
        console.error('Error requesting notification permission:', error);
        return false;
    }
};

export const saveUserPreferences = async (userId: string, preferences: UserPreferences): Promise<void> => {
    // Implement your logic to save user preferences to your backend or local storage
    // This is a placeholder implementation
    localStorage.setItem(`user_${userId}_preferences`, JSON.stringify(preferences));
};

export const getUserPreferences = async (userId: string): Promise<UserPreferences | null> => {
    // Implement your logic to retrieve user preferences from your backend or local storage
    // This is a placeholder implementation
    const preferences = localStorage.getItem(`user_${userId}_preferences`);
    return preferences ? JSON.parse(preferences) : null;
};