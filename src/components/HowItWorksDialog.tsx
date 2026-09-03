import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
    LocationIcon,
    WaterIcon,
    BellIcon,
    BellRingIcon,
    CameraIcon,
} from "@/components/icons/IconLibrary";

interface HowItWorksDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const LEVELS: {
    key: string;
    label: string;
    meaning: string;
    bar: string;
}[] = [
    { key: "normal", label: "Normal", meaning: "Safe", bar: "bg-normal text-normal-foreground" },
    { key: "alert", label: "Alert", meaning: "Rising", bar: "bg-alert text-alert-foreground" },
    { key: "warning", label: "Warning", meaning: "Prepare to act", bar: "bg-warning text-warning-foreground" },
    { key: "danger", label: "Danger", meaning: "Act now", bar: "bg-danger text-danger-foreground" },
];

/**
 * A miniature, non-interactive replica of a real StationCard used purely to
 * demonstrate what the elements mean. Shown at Warning severity so the tinted
 * background, coloured level number, and status badge are all visible at once.
 */
function ExampleCard() {
    return (
        <Card className="border border-border/50 bg-warning/8 pointer-events-none select-none">
            <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <LocationIcon size="sm" className="flex-shrink-0" />
                            <h3 className="text-station-name truncate">
                                Sungai Example
                            </h3>
                            <CameraIcon
                                size="sm"
                                className="text-muted-foreground flex-shrink-0"
                            />
                        </div>
                        <p className="text-metadata truncate">Klang · 2.3 km</p>
                    </div>
                    <BellRingIcon size="sm" className="text-primary flex-shrink-0" />
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <WaterIcon size="sm" />
                        <span className="text-water-level text-warning">
                            2.4
                            <span className="text-body-small font-normal">m</span>
                        </span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-warning px-2 py-1 text-xs font-medium text-warning-foreground">
                        <span className="w-2 h-2 rounded-full bg-warning-foreground/80" />
                        Warning
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}

/** Annotation row: a labelled callout explaining one part of the example card. */
function Callout({
    icon,
    title,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                {icon}
            </div>
            <div className="min-w-0">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{children}</p>
            </div>
        </div>
    );
}

export default function HowItWorksDialog({
    open,
    onOpenChange,
}: HowItWorksDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Reading a station</DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Live example card the user can visually map to real ones */}
                    <div>
                        <ExampleCard />
                        <p className="mt-2 text-center text-xs text-muted-foreground">
                            An example station — this is what a card looks like.
                        </p>
                    </div>

                    {/* Callouts that point back at the parts of the example */}
                    <div className="space-y-4">
                        <Callout
                            icon={<WaterIcon size="sm" />}
                            title="The number is the water level"
                        >
                            It turns colour as the river rises. Nearer stations
                            appear first, with distance shown next to the name.
                        </Callout>
                        <Callout
                            icon={<BellIcon size="sm" />}
                            title="Tap the bell to get alerts"
                        >
                            You&apos;ll get a push notification the moment that
                            station reaches Danger level — even when the app is
                            closed.
                        </Callout>
                        <Callout
                            icon={<CameraIcon size="sm" />}
                            title="Cameras back up the sensor"
                        >
                            When a sensor stops reporting, the card fades to grey.
                            A camera feed, where available, lets you see the river
                            yourself.
                        </Callout>
                    </div>

                    {/* Severity scale — shown as a gradient bar, not a bullet list */}
                    <div>
                        <p className="mb-3 text-sm font-medium">
                            The four levels
                        </p>
                        <div className="flex overflow-hidden rounded-lg border border-border/50">
                            {LEVELS.map((lvl) => (
                                <div
                                    key={lvl.key}
                                    className={cn(
                                        "flex-1 px-2 py-2 text-center",
                                        lvl.bar,
                                    )}
                                >
                                    <span className="text-xs font-semibold">
                                        {lvl.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="mt-2 grid grid-cols-4 gap-1">
                            {LEVELS.map((lvl) => (
                                <p
                                    key={lvl.key}
                                    className="text-center text-[11px] leading-tight text-muted-foreground"
                                >
                                    {lvl.meaning}
                                </p>
                            ))}
                        </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Data comes from JPS Selangor and refreshes every 15
                        minutes.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
