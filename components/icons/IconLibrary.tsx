import { 
  Droplets, 
  Camera, 
  MapPin, 
  Clock, 
  Star, 
  AlertTriangle, 
  AlertCircle,
  CheckCircle,
  XCircle,
  Info,
  Eye,
  EyeOff,
  RefreshCw,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Menu,
  X,
  Search,
  Filter,
  Settings,
  User,
  LogIn,
  LogOut,
  Sun,
  Moon,
  Expand,
  Minimize,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Battery,
  Signal,
  Download,
  Upload,
  Share,
  Heart,
  Bookmark,
  Zap,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  PieChart
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface IconProps {
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  'aria-hidden'?: boolean
  'aria-label'?: string
}

const sizeClasses = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4', 
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8'
}

// Water Level & Monitoring Icons
export const WaterIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <Droplets className={cn(sizeClasses[size], 'text-water-blue', className)} {...props} />
)

export const CameraIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <Camera className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

export const LocationIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <MapPin className={cn(sizeClasses[size], 'text-primary', className)} {...props} />
)

export const TimeIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <Clock className={cn(sizeClasses[size], 'text-muted-foreground', className)} {...props} />
)

// Status Icons
export const StatusNormalIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <CheckCircle className={cn(sizeClasses[size], 'text-normal', className)} {...props} />
)

export const StatusAlertIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <AlertCircle className={cn(sizeClasses[size], 'text-alert', className)} {...props} />
)

export const StatusWarningIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <AlertTriangle className={cn(sizeClasses[size], 'text-warning', className)} {...props} />
)

export const StatusDangerIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <XCircle className={cn(sizeClasses[size], 'text-danger', className)} {...props} />
)

export const InfoIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <Info className={cn(sizeClasses[size], 'text-muted-foreground', className)} {...props} />
)

// Interactive Icons
export const FavoriteIcon = ({ className, size = 'md', active = false, ...props }: IconProps & { active?: boolean }) => (
  <Star className={cn(
    sizeClasses[size], 
    active ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground hover:text-yellow-400',
    'transition-colors duration-200',
    className
  )} {...props} />
)

export const RefreshIcon = ({ className, size = 'md', spinning = false, ...props }: IconProps & { spinning?: boolean }) => (
  <RefreshCw className={cn(
    sizeClasses[size], 
    'text-foreground',
    spinning && 'animate-spin',
    className
  )} {...props} />
)

export const FilterIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <SlidersHorizontal className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

export const SearchIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <Search className={cn(sizeClasses[size], 'text-muted-foreground', className)} {...props} />
)

// Navigation Icons
export const MenuIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <Menu className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

export const CloseIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <X className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

export const ChevronLeftIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <ChevronLeft className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

export const ChevronRightIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <ChevronRight className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

export const ChevronUpIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <ChevronUp className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

export const ChevronDownIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <ChevronDown className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

// Theme Icons
export const LightModeIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <Sun className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

export const DarkModeIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <Moon className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

export const HighContrastIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <Eye className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

// Media Icons
export const ExpandIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <Expand className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

export const MinimizeIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <Minimize className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

// Authentication Icons
export const UserIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <User className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

export const LoginIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <LogIn className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

export const LogoutIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <LogOut className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

// Connection Status Icons
export const OnlineIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <Wifi className={cn(sizeClasses[size], 'text-success', className)} {...props} />
)

export const OfflineIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <WifiOff className={cn(sizeClasses[size], 'text-destructive', className)} {...props} />
)

// Data Visualization Icons
export const TrendUpIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <TrendingUp className={cn(sizeClasses[size], 'text-success', className)} {...props} />
)

export const TrendDownIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <TrendingDown className={cn(sizeClasses[size], 'text-destructive', className)} {...props} />
)

export const ActivityIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <Activity className={cn(sizeClasses[size], 'text-primary', className)} {...props} />
)

export const ChartIcon = ({ className, size = 'md', ...props }: IconProps) => (
  <BarChart3 className={cn(sizeClasses[size], 'text-foreground', className)} {...props} />
)

// Utility function to get status icon by level
export const getStatusIcon = (level: number, props: IconProps = {}) => {
  switch (level) {
    case 0:
      return <StatusNormalIcon {...props} />
    case 1:
      return <StatusAlertIcon {...props} />
    case 2:
      return <StatusWarningIcon {...props} />
    case 3:
      return <StatusDangerIcon {...props} />
    default:
      return <InfoIcon {...props} />
  }
}