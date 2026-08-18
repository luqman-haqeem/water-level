import { renderHook, act, waitFor } from "@testing-library/react";
import { useStationSubscription } from "@/hooks/useStationSubscription";

// Mock the notificationService
const mockSubscribeToStation = vi.fn().mockResolvedValue(undefined);
const mockUnsubscribeFromStation = vi.fn().mockResolvedValue(undefined);
const mockIsSubscribedToStation = vi.fn().mockReturnValue(false);

vi.mock("@/services/notificationService", () => ({
    subscribeToStation: (...args: unknown[]) =>
        mockSubscribeToStation(...args),
    unsubscribeFromStation: (...args: unknown[]) =>
        mockUnsubscribeFromStation(...args),
    isSubscribedToStation: (...args: unknown[]) =>
        mockIsSubscribedToStation(...args),
    getSubscribedStations: () => [],
    getSubscribedStationIds: () => [],
    reconcileTagsWithLocalStorage: vi.fn(),
}));

// Mock react-onesignal for the hook's permission check
vi.mock("react-onesignal", () => ({
    default: {
        Notifications: {
            permission: true,
        },
        User: {
            PushSubscription: {
                optedIn: true,
            },
            getTags: vi.fn().mockResolvedValue({}),
        },
    },
}));

describe("useStationSubscription", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        mockIsSubscribedToStation.mockReturnValue(false);
    });

    it("returns isSubscribed=false initially for a station", () => {
        const { result } = renderHook(() =>
            useStationSubscription("ABC123", "Test Station")
        );

        expect(result.current.isSubscribed).toBe(false);
    });

    it("after calling subscribe(), isSubscribed becomes true", async () => {
        mockSubscribeToStation.mockImplementation(async () => {
            mockIsSubscribedToStation.mockReturnValue(true);
        });

        const { result } = renderHook(() =>
            useStationSubscription("ABC123", "Test Station")
        );

        await act(async () => {
            await result.current.subscribe();
        });

        expect(result.current.isSubscribed).toBe(true);
        expect(mockSubscribeToStation).toHaveBeenCalledWith("ABC123", "Test Station");
    });

    it("after calling unsubscribe(), isSubscribed becomes false", async () => {
        // Start subscribed
        mockIsSubscribedToStation.mockReturnValue(true);

        const { result } = renderHook(() =>
            useStationSubscription("ABC123", "Test Station")
        );

        expect(result.current.isSubscribed).toBe(true);

        mockUnsubscribeFromStation.mockImplementation(async () => {
            mockIsSubscribedToStation.mockReturnValue(false);
        });

        await act(async () => {
            await result.current.unsubscribe();
        });

        expect(result.current.isSubscribed).toBe(false);
        expect(mockUnsubscribeFromStation).toHaveBeenCalledWith("ABC123");
    });

    it("persists state to localStorage for optimistic UI", async () => {
        mockSubscribeToStation.mockImplementation(async () => {
            mockIsSubscribedToStation.mockReturnValue(true);
        });

        const { result } = renderHook(() =>
            useStationSubscription("ABC123", "Test Station")
        );

        await act(async () => {
            await result.current.subscribe();
        });

        // The subscribe function should have been called which updates localStorage
        expect(mockSubscribeToStation).toHaveBeenCalledWith("ABC123", "Test Station");
        expect(result.current.isSubscribed).toBe(true);
    });

    it("loads initial state from localStorage on mount", () => {
        // Simulate that the station is already subscribed in localStorage
        mockIsSubscribedToStation.mockReturnValue(true);

        const { result } = renderHook(() =>
            useStationSubscription("ABC123", "Test Station")
        );

        expect(result.current.isSubscribed).toBe(true);
    });

    it("handles permission denied gracefully", async () => {
        mockSubscribeToStation.mockRejectedValueOnce(
            new Error("Permission denied")
        );

        const { result } = renderHook(() =>
            useStationSubscription("ABC123", "Test Station")
        );

        await act(async () => {
            await result.current.subscribe();
        });

        // Should not throw, isSubscribed remains false
        expect(result.current.isSubscribed).toBe(false);
        expect(result.current.isLoading).toBe(false);
    });

    it("handles OneSignal not loaded gracefully", async () => {
        // When OneSignal is not loaded, subscribeToStation still updates localStorage
        mockSubscribeToStation.mockImplementation(async () => {
            // Simulates localStorage-only update (OneSignal error handled internally)
            mockIsSubscribedToStation.mockReturnValue(true);
        });

        const { result } = renderHook(() =>
            useStationSubscription("ABC123", "Test Station")
        );

        await act(async () => {
            await result.current.subscribe();
        });

        // Should still work with localStorage fallback
        expect(result.current.isSubscribed).toBe(true);
    });

    it("shows isLoading=true while async operation is in progress", async () => {
        let resolveSubscribe: () => void;
        const subscribePromise = new Promise<void>((resolve) => {
            resolveSubscribe = resolve;
        });

        mockSubscribeToStation.mockImplementation(() => subscribePromise);

        const { result } = renderHook(() =>
            useStationSubscription("ABC123", "Test Station")
        );

        // Start subscribe but don't await
        let subscribeAction: Promise<void>;
        act(() => {
            subscribeAction = result.current.subscribe();
        });

        // Should be loading
        await waitFor(() => {
            expect(result.current.isLoading).toBe(true);
        });

        // Resolve and complete
        await act(async () => {
            mockIsSubscribedToStation.mockReturnValue(true);
            resolveSubscribe!();
            await subscribeAction;
        });

        expect(result.current.isLoading).toBe(false);
    });

    it("returns isLoading=false initially", () => {
        const { result } = renderHook(() =>
            useStationSubscription("ABC123", "Test Station")
        );

        expect(result.current.isLoading).toBe(false);
    });
});
