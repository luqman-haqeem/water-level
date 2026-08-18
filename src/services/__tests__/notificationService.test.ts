import {
    subscribeToStation,
    unsubscribeFromStation,
    getSubscribedStations,
    isSubscribedToStation,
} from "@/services/notificationService";

// Mock the react-onesignal module
const mockAddTag = vi.fn().mockResolvedValue(undefined);
const mockRemoveTag = vi.fn().mockResolvedValue(undefined);
const mockOptIn = vi.fn().mockResolvedValue(undefined);

vi.mock("react-onesignal", () => ({
    default: {
        User: {
            addTag: (...args: unknown[]) => mockAddTag(...args),
            removeTag: (...args: unknown[]) => mockRemoveTag(...args),
            PushSubscription: {
                optedIn: false,
                optIn: (...args: unknown[]) => mockOptIn(...args),
            },
        },
        Notifications: {
            permission: true,
        },
    },
}));

describe("notificationService", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    describe("subscribeToStation", () => {
        it("calls OneSignal.User.addTag with station_{id} and 'true'", async () => {
            await subscribeToStation("ABC123");

            expect(mockAddTag).toHaveBeenCalledWith("station_ABC123", "true");
        });

        it("updates localStorage with the subscribed station", async () => {
            await subscribeToStation("ABC123");

            const stored = JSON.parse(
                localStorage.getItem("subscribed_stations") || "[]"
            );
            expect(stored).toContain("ABC123");
        });

        it("does not duplicate station IDs in localStorage", async () => {
            await subscribeToStation("ABC123");
            await subscribeToStation("ABC123");

            const stored = JSON.parse(
                localStorage.getItem("subscribed_stations") || "[]"
            );
            expect(stored.filter((id: string) => id === "ABC123")).toHaveLength(
                1
            );
        });

        it("calls optIn on first subscribe if not already opted in", async () => {
            await subscribeToStation("ABC123");

            expect(mockOptIn).toHaveBeenCalled();
        });

        it("does not call optIn if already opted in", async () => {
            // Simulate already opted in
            const OneSignal = await import("react-onesignal");
            (
                OneSignal.default.User.PushSubscription as { optedIn: boolean }
            ).optedIn = true;

            await subscribeToStation("XYZ789");

            expect(mockOptIn).not.toHaveBeenCalled();

            // Reset for other tests
            (
                OneSignal.default.User.PushSubscription as { optedIn: boolean }
            ).optedIn = false;
        });
    });

    describe("unsubscribeFromStation", () => {
        it("calls OneSignal.User.removeTag with station_{id}", async () => {
            // First subscribe, then unsubscribe
            await subscribeToStation("ABC123");
            vi.clearAllMocks();

            await unsubscribeFromStation("ABC123");

            expect(mockRemoveTag).toHaveBeenCalledWith("station_ABC123");
        });

        it("removes the station from localStorage", async () => {
            await subscribeToStation("ABC123");
            await subscribeToStation("DEF456");

            await unsubscribeFromStation("ABC123");

            const stored = JSON.parse(
                localStorage.getItem("subscribed_stations") || "[]"
            );
            expect(stored).not.toContain("ABC123");
            expect(stored).toContain("DEF456");
        });
    });

    describe("getSubscribedStations", () => {
        it("returns an empty array when no stations are subscribed", () => {
            const result = getSubscribedStations();
            expect(result).toEqual([]);
        });

        it("returns array of subscribed station IDs from localStorage", async () => {
            await subscribeToStation("ABC123");
            await subscribeToStation("DEF456");

            const result = getSubscribedStations();
            expect(result).toEqual(["ABC123", "DEF456"]);
        });
    });

    describe("isSubscribedToStation", () => {
        it("returns false for an unsubscribed station", () => {
            expect(isSubscribedToStation("ABC123")).toBe(false);
        });

        it("returns true for a subscribed station", async () => {
            await subscribeToStation("ABC123");

            expect(isSubscribedToStation("ABC123")).toBe(true);
        });

        it("returns false after unsubscribing", async () => {
            await subscribeToStation("ABC123");
            await unsubscribeFromStation("ABC123");

            expect(isSubscribedToStation("ABC123")).toBe(false);
        });
    });

    describe("handles OneSignal not initialized", () => {
        it("falls back to localStorage-only when OneSignal addTag throws", async () => {
            mockAddTag.mockRejectedValueOnce(
                new Error("OneSignal not initialized")
            );

            // Should not throw - falls back gracefully
            await subscribeToStation("ABC123");

            // localStorage should still be updated
            const stored = JSON.parse(
                localStorage.getItem("subscribed_stations") || "[]"
            );
            expect(stored).toContain("ABC123");
        });

        it("falls back to localStorage-only when OneSignal removeTag throws", async () => {
            await subscribeToStation("ABC123");
            mockRemoveTag.mockRejectedValueOnce(
                new Error("OneSignal not initialized")
            );

            // Should not throw
            await unsubscribeFromStation("ABC123");

            // localStorage should still be updated
            const stored = JSON.parse(
                localStorage.getItem("subscribed_stations") || "[]"
            );
            expect(stored).not.toContain("ABC123");
        });
    });

    describe("handles rapid toggle", () => {
        it("processes rapid subscribe/unsubscribe correctly with final state", async () => {
            // Rapid toggle: subscribe -> unsubscribe -> subscribe
            await subscribeToStation("ABC123");
            await unsubscribeFromStation("ABC123");
            await subscribeToStation("ABC123");

            const stored = JSON.parse(
                localStorage.getItem("subscribed_stations") || "[]"
            );
            expect(stored).toContain("ABC123");
            expect(isSubscribedToStation("ABC123")).toBe(true);
        });

        it("handles concurrent operations without corruption", async () => {
            // Fire multiple subscribes simultaneously
            await Promise.all([
                subscribeToStation("ST1"),
                subscribeToStation("ST2"),
                subscribeToStation("ST3"),
            ]);

            const result = getSubscribedStations();
            expect(result).toContain("ST1");
            expect(result).toContain("ST2");
            expect(result).toContain("ST3");
            expect(result).toHaveLength(3);
        });
    });
});
