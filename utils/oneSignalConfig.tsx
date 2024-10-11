import OneSignal from 'react-onesignal';
// import novu from './novu';

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
            allowLocalhostAsSecureOrigin: true
        });
    }
    // OneSignal.showSlidedownPrompt();
};
export const promptForNotificationPermission = async () => {
    const permission = await OneSignal.Notifications.requestPermission();
    return permission;
};

export const subscribeUser = async (userId: string): Promise<void> => {
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




