import OneSignal from 'react-onesignal';
// import novu from './novu';
import useUserStore from '../lib/store';

export const initializeOneSignal = async () => {

    if (typeof window !== 'undefined') {
        OneSignal.init({
            appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!,
            safari_web_id: process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID!,

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
            const { user, setIsSubscribed } = useUserStore.getState(); // Use getState() instead of hook

            if (permissionChange) {
                console.log(`permission accepted!`);
                if (user?.id) {
                    await subscribeUser(user.id);
                    setIsSubscribed(true);
                }
            } else {
                setIsSubscribed(false);
            }
        };

        OneSignal.Notifications.addEventListener('permissionChange', permissionChangeListener);

    }
    // OneSignal.showSlidedownPrompt();
};

const permissionChangeListener = async (permission: any) => {
    const { user, setIsSubscribed } = useUserStore();

    if (permission) {
        console.log(`permission accepted!`);
        await subscribeUser(user?.id ?? '');
        // console.log('request permission', permission);

        setIsSubscribed(permission);
        // await logSubscriptionChange(true);
    } else {

    }
}


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




