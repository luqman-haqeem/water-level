import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { WaterIcon } from "@/components/icons/IconLibrary";
import {
    getInstallPromptEvent,
    subscribeInstallPrompt,
    clearInstallPromptEvent,
    isRunningStandalone,
    type BeforeInstallPromptEvent,
} from "@/utils/installPrompt";

interface FirstRunPromptProps {
    onAllowLocation: () => void;
    onSkip: () => void;
}

export default function FirstRunPrompt({
    onAllowLocation,
    onSkip,
}: FirstRunPromptProps) {
    // Seed from the module-level cache so an event that already fired (before
    // this overlay mounted) still surfaces the interactive install button.
    const [installEvent, setInstallEvent] =
        useState<BeforeInstallPromptEvent | null>(() =>
            getInstallPromptEvent()
        );
    const [showInstall, setShowInstall] = useState(false);

    useEffect(() => {
        setShowInstall(!isRunningStandalone());

        // Pick up the latest cached event in case it fired between render and
        // this effect, then keep a live subscription for events that fire later.
        setInstallEvent(getInstallPromptEvent());
        const unsubscribe = subscribeInstallPrompt((event) => {
            setInstallEvent(event);
        });
        return unsubscribe;
    }, []);

    const handleInstall = async () => {
        if (!installEvent) return;
        await installEvent.prompt();
        const { outcome } = await installEvent.userChoice;
        // The prompt can only be used once; clear it in both cases. If the user
        // accepted, hide the affordance entirely.
        clearInstallPromptEvent();
        setInstallEvent(null);
        if (outcome === "accepted") {
            setShowInstall(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-6 text-center">
            <WaterIcon size="xl" className="text-primary h-16 w-16 mb-6" />
            <h1 className="text-heading-1 mb-2">River Water Level</h1>
            <p className="text-muted-foreground max-w-sm mb-8">
                Get alerted when rivers near you reach danger level.
            </p>
            <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                <Button
                    className="w-full min-h-touch"
                    onClick={onAllowLocation}
                >
                    Allow Location
                </Button>
                <Button
                    variant="ghost"
                    className="w-full min-h-touch"
                    onClick={onSkip}
                >
                    Skip for now
                </Button>
            </div>

            {showInstall && (
                <div className="mt-8 flex flex-col items-center gap-2 max-w-xs">
                    {installEvent ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            onClick={handleInstall}
                        >
                            Add to Home Screen
                        </Button>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            To install: tap the Share icon, then &quot;Add to
                            Home Screen&quot;
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
