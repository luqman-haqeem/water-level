import { useState, useEffect } from "react";
import { getSubscribedStationIds } from "@/services/notificationService";

export function useOnboarding() {
    const [showFirstRun, setShowFirstRun] = useState(false);

    useEffect(() => {
        const isFirstRun =
            !localStorage.getItem("onboarding-complete") &&
            !localStorage.getItem("water-level-advanced-filters") &&
            getSubscribedStationIds().length === 0;
        setShowFirstRun(isFirstRun);
    }, []);

    const completeOnboarding = () => {
        localStorage.setItem("onboarding-complete", "true");
        setShowFirstRun(false);
    };

    return { showFirstRun, completeOnboarding };
}
