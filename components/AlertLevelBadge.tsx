import { Badge } from "@/components/ui/badge"

interface AlertLevelBadgeProps {
    alert_level: number;
    className?: string; // Add this line

}

const AlertLevelBadge: React.FC<AlertLevelBadgeProps> = ({ alert_level, className }) => {

    const alertNames: Record<number, string> = {
        1: "Alert",
        2: "Warning",
        3: "Danger",
    };

    let variant: "alert" | "destructive" | "warning" | "secondary" = "secondary";
    switch (alert_level) {
        case 1:
            variant = "alert";
            break;
        case 2:
            variant = "warning";
            break;
        case 3:
            variant = "destructive";
            break;
        default:
            variant = "secondary";
    }

    const alertName = alertNames[alert_level] || "Normal";

    return <Badge className={className} variant={variant}>{alertName}</Badge>;
}

export default AlertLevelBadge;