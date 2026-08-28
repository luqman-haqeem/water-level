import { render, screen, fireEvent } from "@testing-library/react";
import StationCard from "@/components/StationCard";

// Mock useStationSubscription hook
const mockSubscribe = vi.fn().mockResolvedValue({ permissionGranted: true });
const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
let mockIsSubscribed = false;

vi.mock("@/hooks/useStationSubscription", () => ({
    useStationSubscription: () => ({
        isSubscribed: mockIsSubscribed,
        subscribe: mockSubscribe,
        unsubscribe: mockUnsubscribe,
        isLoading: false,
    }),
}));

// Mock react-onesignal
vi.mock("react-onesignal", () => ({
    default: {
        User: {
            PushSubscription: { optedIn: true },
            addTag: vi.fn(),
            removeTag: vi.fn(),
        },
        Notifications: { permission: true },
    },
}));

// Mock MicroTrendChart to avoid Convex dependency
vi.mock("@/components/MicroTrendChart", () => ({
    default: () => <div data-testid="micro-trend-chart" />,
}));

// Mock WaterLevelGauge
vi.mock("@/components/WaterLevelGauge", () => ({
    default: () => <div data-testid="water-level-gauge" />,
}));

// Mock NotificationPermissionDialog
vi.mock("@/components/NotificationPermissionDialog", () => ({
    default: () => null,
}));

// Mock haptics
vi.mock("@/utils/haptics", () => ({
    haptics: { select: vi.fn() },
}));

// Mock Notification API (not available in jsdom)
Object.defineProperty(globalThis, 'Notification', {
    value: { permission: 'granted' },
    writable: true,
});

const mockStation = {
    id: "station123" as unknown as import("../../../convex/_generated/dataModel").Id<"stations">,
    station_name: "Test Station",
    districts: { name: "Test District" },
    current_levels: {
        current_level: 5.2,
        updated_at: "2024-01-01T00:00:00Z",
        alert_level: "1",
    },
    cameras: null,
    normal_water_level: 3.0,
    alert_water_level: 5.0,
    warning_water_level: 7.0,
    danger_water_level: 9.0,
    station_status: true,
};

describe("StationCard - Bell Icon", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsSubscribed = false;
    });

    it("renders a bell icon button", () => {
        render(
            <StationCard
                station={mockStation}
                isSelected={false}
                onSelect={vi.fn()}
            />
        );

        const bellButton = screen.getByRole("button", {
            name: /notification/i,
        });
        expect(bellButton).toBeInTheDocument();
    });

    it("bell icon shows outline/inactive state (Bell) when not subscribed", () => {
        mockIsSubscribed = false;

        render(
            <StationCard
                station={mockStation}
                isSelected={false}
                onSelect={vi.fn()}
            />
        );

        const bellButton = screen.getByRole("button", {
            name: /notification/i,
        });
        expect(bellButton).toHaveAttribute("data-subscribed", "false");
    });

    it("bell icon shows filled/active state (BellRing) when station is subscribed", () => {
        mockIsSubscribed = true;

        render(
            <StationCard
                station={mockStation}
                isSelected={false}
                onSelect={vi.fn()}
            />
        );

        const bellButton = screen.getByRole("button", {
            name: /notification/i,
        });
        expect(bellButton).toHaveAttribute("data-subscribed", "true");
    });

    it("clicking bell calls subscribe when not subscribed", () => {
        mockIsSubscribed = false;

        render(
            <StationCard
                station={mockStation}
                isSelected={false}
                onSelect={vi.fn()}
            />
        );

        const bellButton = screen.getByRole("button", {
            name: /notification/i,
        });
        fireEvent.click(bellButton);

        expect(mockSubscribe).toHaveBeenCalled();
    });

    it("clicking bell calls unsubscribe when subscribed", () => {
        mockIsSubscribed = true;

        render(
            <StationCard
                station={mockStation}
                isSelected={false}
                onSelect={vi.fn()}
            />
        );

        const bellButton = screen.getByRole("button", {
            name: /notification/i,
        });
        fireEvent.click(bellButton);

        expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it("bell click does NOT trigger the card's onSelect handler (stopPropagation)", () => {
        const mockOnSelect = vi.fn();

        render(
            <StationCard
                station={mockStation}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        const bellButton = screen.getByRole("button", {
            name: /notification/i,
        });
        fireEvent.click(bellButton);

        expect(mockOnSelect).not.toHaveBeenCalled();
    });
});
