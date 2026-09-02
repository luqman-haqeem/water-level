import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface HowItWorksDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function HowItWorksDialog({
    open,
    onOpenChange,
}: HowItWorksDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>How it works</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm text-muted-foreground">
                    <p>
                        &bull; River levels are checked every 15 minutes from
                        JPS Selangor
                    </p>
                    <p>&bull; Stations nearest to you are shown first</p>
                    <p>
                        &bull; Tap the bell icon on a station to get a push
                        notification when it reaches Danger level
                    </p>
                    <div className="space-y-1.5">
                        <p>&bull; What the colours mean:</p>
                        <div className="pl-4 space-y-1.5">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-normal flex-shrink-0" />
                                <span>Green (Normal) &mdash; safe</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-alert flex-shrink-0" />
                                <span>Amber (Alert) &mdash; rising</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-warning flex-shrink-0" />
                                <span>
                                    Orange (Warning) &mdash; prepare to act
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
                                <span>Red (Danger) &mdash; act now</span>
                            </div>
                        </div>
                    </div>
                    <p>
                        &bull; Grey or faded cards have no recent data from the
                        sensor
                    </p>
                    <p>
                        &bull; Camera feeds help when the water level sensor is
                        down
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
