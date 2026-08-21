import { render, screen, fireEvent } from "@testing-library/react";
import NotificationHandler from "@/components/NotificationHandler";

// Mock notificationService
const mockGetSubscribedStations = vi.fn().mockReturnValue([]);
const mockUnsubscribeFromStation = vi.fn().mockResolvedValue(undefined);

vi.mock("@/services/notificationService", () => ({
    getSubscribedStations: () => mockGetSubscribedStations(),
    getSubscribedStationIds: () =>
        mockGetSubscribedStations().map((s: { id: string }) => s.id),
    unsubscribeFromStation: (...args: unknown[]) =>
        mockUnsubscribeFromStation(...args),
    subscribeToStation: vi.fn(),
    isSubscribedToStation: vi.fn(),
    reconcileTagsWithLocalStorage: vi.fn(),
}));

// Mock react-onesignal
vi.mock("react-onesignal", () => ({
    default: {
        init: vi.fn(),
        User: {
            PushSubscription: {
                optedIn: true,
                optIn: vi.fn(),
                optOut: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            },
            addTag: vi.fn(),
            removeTag: vi.fn(),
            getTags: vi.fn().mockResolvedValue({}),
        },
        Notifications: { permission: true },
    },
}));

describe("NotificationHandler - Subscribed Stations Dialog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSubscribedStations.mockReturnValue([]);
    });

    it("renders dialog with list of subscribed stations showing names", () => {
        mockGetSubscribedStations.mockReturnValue([
            { id: "station1", name: "Sg Klang at Midlands" },
            { id: "station2", name: "Sg Gombak at KL" },
        ]);

        render(
            <NotificationHandler open={true} onOpenChange={vi.fn()} />
        );

        expect(
            screen.getByText("Sg Klang at Midlands")
        ).toBeInTheDocument();
        expect(screen.getByText("Sg Gombak at KL")).toBeInTheDocument();
    });

    it("shows empty state when no stations subscribed", () => {
        mockGetSubscribedStations.mockReturnValue([]);

        render(
            <NotificationHandler open={true} onOpenChange={vi.fn()} />
        );

        expect(
            screen.getByText(/no stations subscribed/i)
        ).toBeInTheDocument();
    });

    it("each subscribed station has an unsubscribe button", () => {
        mockGetSubscribedStations.mockReturnValue([
            { id: "station1", name: "Station A" },
            { id: "station2", name: "Station B" },
        ]);

        render(
            <NotificationHandler open={true} onOpenChange={vi.fn()} />
        );

        const unsubscribeButtons = screen.getAllByRole("button", {
            name: /unsubscribe/i,
        });
        expect(unsubscribeButtons).toHaveLength(2);
    });

    it("clicking unsubscribe removes station from list", () => {
        mockGetSubscribedStations.mockReturnValue([
            { id: "station1", name: "Station A" },
            { id: "station2", name: "Station B" },
        ]);

        render(
            <NotificationHandler open={true} onOpenChange={vi.fn()} />
        );

        const unsubscribeButtons = screen.getAllByRole("button", {
            name: /unsubscribe/i,
        });
        fireEvent.click(unsubscribeButtons[0]);

        expect(mockUnsubscribeFromStation).toHaveBeenCalledWith("station1");
    });
});
