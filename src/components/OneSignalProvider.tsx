import { useEffect, useRef } from "react";
import OneSignal from "react-onesignal";
import { reconcileTagsWithLocalStorage } from "@/services/notificationService";

let oneSignalInitialized = false;

/**
 * OneSignalProvider initializes the OneSignal SDK once at app startup
 * and performs tag reconciliation to keep localStorage in sync with
 * the actual OneSignal device tags.
 *
 * This must wrap (or be placed near) the app root so that the SDK is
 * ready before any StationCard bell icons attempt addTag/removeTag.
 */
export default function OneSignalProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const initAttempted = useRef(false);

    useEffect(() => {
        if (oneSignalInitialized || initAttempted.current) return;
        initAttempted.current = true;

        const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
        if (!appId) {
            console.warn(
                "[OneSignalProvider] VITE_ONESIGNAL_APP_ID not set, skipping OneSignal init"
            );
            return;
        }

        OneSignal.init({ appId })
            .then(() => {
                oneSignalInitialized = true;
                console.log("[OneSignalProvider] OneSignal initialized");

                // After successful init, reconcile tags with localStorage
                reconcileTagsWithLocalStorage();
            })
            .catch((error) => {
                console.warn(
                    "[OneSignalProvider] OneSignal init failed:",
                    error
                );
            });
    }, []);

    return <>{children}</>;
}
