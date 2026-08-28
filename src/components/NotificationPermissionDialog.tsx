import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface NotificationPermissionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
}

export default function NotificationPermissionDialog({
    open,
    onOpenChange,
    onConfirm,
}: NotificationPermissionDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Enable Flood Alerts</DialogTitle>
                    <DialogDescription>
                        You&apos;ll receive a push notification when this station
                        reaches Danger level. Alerts are rare - typically during
                        heavy rain seasons.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-2 pt-4">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                    >
                        Not Now
                    </Button>
                    <Button
                        onClick={() => {
                            onConfirm();
                            onOpenChange(false);
                        }}
                    >
                        Enable Alerts
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
