import OneSignal from 'react-onesignal';

export const initializeOneSignal = async () => {
    OneSignal.init({
        appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID as string,
        safari_web_id: process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID as string,

        notifyButton: {
            enable: true,
        },
        serviceWorkerParam: { scope: "/push/onesignal/" },
        serviceWorkerPath: "push/onesignal/OneSignalSDKWorker.js",
        allowLocalhostAsSecureOrigin: true
    });
    // OneSignal.showSlidedownPrompt();
};

// export const subscribeUser = async (userId: string) => {
//     const isSubscribed = await OneSignal.isPushNotificationsEnabled();
//     if (!isSubscribed) {
//         await OneSignal.registerForPushNotifications();
//         await OneSignal.setExternalUserId(userId);
//     }
// };

// export const unsubscribeUser = async () => {
//     await OneSignal.setExternalUserId('');
//     await OneSignal.unregisterForPushNotifications();
// };