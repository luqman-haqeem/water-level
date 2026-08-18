import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface AlertLevelBadgeProps {
    alert_level: number;
    className?: string;
    showIcon?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

const AlertLevelBadge: React.FC<AlertLevelBadgeProps> = ({ 
    alert_level, 
    className,
    showIcon = true,
    size = 'md'
}) => {
    const getAlertConfig = (level: number) => {
        switch (level) {
            case 0:
                return {
                    name: "Normal",
                    variant: "secondary",
                    icon: "🟢",
                    className: "bg-normal text-normal-foreground hover:bg-normal/80"
                };
            case 1:
                return {
                    name: "Alert",
                    variant: "alert",
                    icon: "🟠",
                    className: "bg-alert text-alert-foreground hover:bg-alert/80"
                };
            case 2:
                return {
                    name: "Warning",
                    variant: "warning", 
                    icon: "🟡",
                    className: "bg-warning text-warning-foreground hover:bg-warning/80"
                };
            case 3:
                return {
                    name: "Danger",
                    variant: "destructive",
                    icon: "🔴",
                    className: "bg-danger text-danger-foreground hover:bg-danger/80"
                };
            default:
                return {
                    name: "Unknown",
                    variant: "secondary",
                    icon: "⚪",
                    className: "bg-muted text-muted-foreground"
                };
        }
    };

    const config = getAlertConfig(alert_level);
    
    const sizeClasses = {
        sm: "text-xs px-2 py-1 h-5",
        md: "text-sm px-2.5 py-1 h-6", 
        lg: "text-base px-3 py-1.5 h-8"
    };

    return (
        <Badge 
            className={cn(
                "font-medium transition-all duration-200 border-0",
                config.className,
                sizeClasses[size],
                className
            )}
        >
            {showIcon && (
                <span className="mr-1" role="img" aria-label={config.name}>
                    {config.icon}
                </span>
            )}
            {config.name}
        </Badge>
    );
}

export default AlertLevelBadge;