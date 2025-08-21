import OneSignal from 'react-onesignal';
// import novu from './novu';
import { useUserStore } from '../lib/convexStore';

export const initializeOneSignal = async () => {
    // Check if OneSignal is configured
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    const safariWebId = process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID;
    
    if (!appId || appId === 'your_onesignal_app_id') {
        console.log('OneSignal not configured - skipping initialization');
        return;
    }

    if (typeof window !== 'undefined') {
        OneSignal.init({
            appId: appId,
            safari_web_id: safariWebId || '',

            // notifyButton: {
            //     enable: true,
            // },
            serviceWorkerParam: { scope: "/push/onesignal/" },
            serviceWorkerPath: "push/onesignal/OneSignalSDKWorker.js",
            allowLocalhostAsSecureOrigin: true,
            promptOptions: {
                /* Change bold title, limited to 30 characters */
                siteName: 'River Water Level',
                /* Subtitle, limited to 90 characters */
                actionMessage: "Get notified when your favorite station reaches a danger level.",
                /* Example notification title */
                // exampleNotificationTitle: 'Example notification',
                // /* Example notification message */
                // exampleNotificationMessage: 'This is an example notification',
                // /* Text below example notification, limited to 50 characters */
                // exampleNotificationCaption: 'You can unsubscribe anytime',
                /* Accept button text, limited to 15 characters */
                acceptButtonText: "ALLOW",
                /* Cancel button text, limited to 15 characters */
                cancelButtonText: "NO THANKS",
                autoAcceptTitle: 'Click Allow'
            }
        });


        // OneSignal.Notifications.addEventListener("permissionChange", permissionChangeListener);
        // OneSignal.Notifications.addEventListener.on('permissionChange', (permission) => {
        //     console.log('Permission changed to:', permission.toString());
        // });


        const permissionChangeListener = async (permissionChange: any) => {
            // Note: We can't use the useUserStore hook in this context
            // For now, we'll handle this differently or pass user state when needed
            if (permissionChange) {
                console.log(`permission accepted!`);
                // await subscribeUser(user.id);
                // setIsSubscribed(true);
            } else {
                // setIsSubscribed(false);
            }
        };

        OneSignal.Notifications.addEventListener('permissionChange', permissionChangeListener);

    }
    // OneSignal.showSlidedownPrompt();
};

// This function is not used anymore since we moved the logic above
// const permissionChangeListener = async (permission: any) => {
//     if (permission) {
//         console.log(`permission accepted!`);
//         // Handle permission logic here
//     }
// }


export const promptForNotificationPermission = async () => {
    // const permission = await OneSignal.Notifications.requestPermission();
    const permission = await OneSignal.Slidedown.promptPush({ force: true });

    console.log('request permission', OneSignal.Slidedown);
    return permission;
};

export const subscribeUser = async (userId: string): Promise<void> => {
    if (!userId) {
        console.log('No user ID provided');

        return;
    }
    await OneSignal.login(userId);

    let onesignalId = OneSignal?.User?.PushSubscription?.id ?? '';
    // linkNovuSubscriberToOneSignal(userId, onesignalId);
    // sendNotification('test message');
};

export const unsubscribeUser = async (): Promise<void> => {
    await OneSignal.logout();
};

async function linkNovuSubscriberToOneSignal(subscriberId: string, playerId: string) {

    try {
        const response = await fetch('/api/link-to-novu', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscriberId, playerId }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Successfully linked OneSignal Player ID to Novu subscriber:', data);
    } catch (error) {
        console.error('Error linking OneSignal Player ID to Novu subscriber:', error);
    }
    // try {
    //     await novu.subscribers.setCredentials(subscriberId, 'onesignal', {
    //         deviceTokens: [playerId],
    //     });
    //     console.log('Successfully linked OneSignal Player ID to Novu subscriber');
    // } catch (error) {
    //     console.error('Error linking OneSignal Player ID to Novu subscriber:', error);
    // }
}




