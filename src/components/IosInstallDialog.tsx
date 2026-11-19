import { useEffect } from "react";
import { Share, SquarePlus } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

interface IosInstallDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    stationId?: string;
}

/**
 * Shown instead of subscribing when an iPhone/iPad user taps the bell in a
 * browser tab. iOS only delivers web push to apps opened from the Home
 * Screen, so subscribing here would look like success and never alert (#78).
 */
export default function IosInstallDialog({
    open,
    onOpenChange,
    stationId,
}: IosInstallDialogProps) {
    useEffect(() => {
        if (open) {
            track("ios_install_required_shown", { stationId });
        }
    }, [open, stationId]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add to Home Screen for alerts</DialogTitle>
                    <DialogDescription>
                        On iPhone and iPad, flood alerts only work when the app is
                        opened from your Home Screen, not from a browser tab.
                    </DialogDescription>
                </DialogHeader>
                <ol className="space-y-3 py-2 text-sm">
                    <li className="flex items-start gap-3">
                        <span className="font-medium tabular-nums">1.</span>
                        <span>
                            Tap the Share button{" "}
                            <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" />{" "}
                            in the browser toolbar.
                        </span>
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="font-medium tabular-nums">2.</span>
                        <span>
                            Choose{" "}
                            <span className="font-medium">
                                Add to Home Screen{" "}
                                <SquarePlus className="inline h-4 w-4 align-text-bottom" aria-hidden="true" />
                            </span>
                            .
                        </span>
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="font-medium tabular-nums">3.</span>
                        <span>
                            Open the app from its Home Screen icon and tap the bell
                            again.
                        </span>
                    </li>
                </ol>
                <p className="text-xs text-muted-foreground">
                    Requires iOS 16.4 or later.
                </p>
                <div className="flex justify-end pt-2">
                    <Button
                        className="min-h-touch"
                        onClick={() => onOpenChange(false)}
                    >
                        Got it
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
