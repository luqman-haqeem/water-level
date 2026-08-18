import {
    subscribeToStation,
    unsubscribeFromStation,
    getSubscribedStations,
    getSubscribedStationIds,
    isSubscribedToStation,
    reconcileTagsWithLocalStorage,
} from "@/services/notificationService";

// Mock the react-onesignal module
const mockAddTag = vi.fn().mockResolvedValue(undefined);
const mockRemoveTag = vi.fn().mockResolvedValue(undefined);
const mockOptIn = vi.fn().mockResolvedValue(undefined);
const mockGetTags = vi.fn().mockResolvedValue({});

vi.mock("react-onesignal", () => ({
    default: {
        User: {
            addTag: (...args: unknown[]) => mockAddTag(...args),
            removeTag: (...args: unknown[]) => mockRemoveTag(...args),
            getTags: (...args: unknown[]) => mockGetTags(...args),
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
            await subscribeToStation("ABC123", "Test Station");

            expect(mockAddTag).toHaveBeenCalledWith("station_ABC123", "true");
        });

        it("updates localStorage with the subscribed station as {id, name} tuple", async () => {
            await subscribeToStation("ABC123", "Sg Klang at Midlands");

            const stored = JSON.parse(
                localStorage.getItem("subscribed_stations") || "[]"
            );
            expect(stored).toEqual([
                { id: "ABC123", name: "Sg Klang at Midlands" },
            ]);
        });

        it("does not duplicate station IDs in localStorage", async () => {
            await subscribeToStation("ABC123", "Test Station");
            await subscribeToStation("ABC123", "Test Station");

            const stored = JSON.parse(
                localStorage.getItem("subscribed_stations") || "[]"
            );
            expect(
                stored.filter(
                    (s: { id: string }) => s.id === "ABC123"
                )
            ).toHaveLength(1);
        });

        it("calls optIn on first subscribe if not already opted in", async () => {
            await subscribeToStation("ABC123", "Test Station");

            expect(mockOptIn).toHaveBeenCalled();
        });

        it("does not call optIn if already opted in", async () => {
            // Simulate already opted in
            const OneSignal = await import("react-onesignal");
            (
                OneSignal.default.User.PushSubscription as { optedIn: boolean }
            ).optedIn = true;

            await subscribeToStation("XYZ789", "Another Station");

            expect(mockOptIn).not.toHaveBeenCalled();

            // Reset for other tests
            (
                OneSignal.default.User.PushSubscription as { optedIn: boolean }
            ).optedIn = false;
        });

        it("uses default name when stationName is not provided", async () => {
            await subscribeToStation("ABC123");

            const stored = JSON.parse(
                localStorage.getItem("subscribed_stations") || "[]"
            );
            expect(stored).toEqual([
                { id: "ABC123", name: "Unknown Station" },
            ]);
        });
    });

    describe("unsubscribeFromStation", () => {
        it("calls OneSignal.User.removeTag with station_{id}", async () => {
            // First subscribe, then unsubscribe
            await subscribeToStation("ABC123", "Test Station");
            vi.clearAllMocks();

            await unsubscribeFromStation("ABC123");

            expect(mockRemoveTag).toHaveBeenCalledWith("station_ABC123");
        });

        it("removes the station from localStorage", async () => {
            await subscribeToStation("ABC123", "Station A");
            await subscribeToStation("DEF456", "Station B");

            await unsubscribeFromStation("ABC123");

            const stored = JSON.parse(
                localStorage.getItem("subscribed_stations") || "[]"
            );
            expect(stored.find((s: { id: string }) => s.id === "ABC123")).toBeUndefined();
            expect(stored.find((s: { id: string }) => s.id === "DEF456")).toBeDefined();
        });
    });

    describe("getSubscribedStations", () => {
        it("returns an empty array when no stations are subscribed", () => {
            const result = getSubscribedStations();
            expect(result).toEqual([]);
        });

        it("returns array of {id, name} tuples from localStorage", async () => {
            await subscribeToStation("ABC123", "Station A");
            await subscribeToStation("DEF456", "Station B");

            const result = getSubscribedStations();
            expect(result).toEqual([
                { id: "ABC123", name: "Station A" },
                { id: "DEF456", name: "Station B" },
            ]);
        });

        it("migrates legacy string[] format to {id, name} tuples", () => {
            // Simulate old format
            localStorage.setItem(
                "subscribed_stations",
                JSON.stringify(["ABC123", "DEF456"])
            );

            const result = getSubscribedStations();
            expect(result).toEqual([
                { id: "ABC123", name: "Unknown Station" },
                { id: "DEF456", name: "Unknown Station" },
            ]);

            // Verify it persisted the migrated format
            const stored = JSON.parse(
                localStorage.getItem("subscribed_stations") || "[]"
            );
            expect(stored[0]).toHaveProperty("id");
            expect(stored[0]).toHaveProperty("name");
        });
    });

    describe("getSubscribedStationIds", () => {
        it("returns just the IDs as a string array", async () => {
            await subscribeToStation("ABC123", "Station A");
            await subscribeToStation("DEF456", "Station B");

            const result = getSubscribedStationIds();
            expect(result).toEqual(["ABC123", "DEF456"]);
        });
    });

    describe("isSubscribedToStation", () => {
        it("returns false for an unsubscribed station", () => {
            expect(isSubscribedToStation("ABC123")).toBe(false);
        });

        it("returns true for a subscribed station", async () => {
            await subscribeToStation("ABC123", "Test Station");

            expect(isSubscribedToStation("ABC123")).toBe(true);
        });

        it("returns false after unsubscribing", async () => {
            await subscribeToStation("ABC123", "Test Station");
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
            await subscribeToStation("ABC123", "Test Station");

            // localStorage should still be updated
            const stored = JSON.parse(
                localStorage.getItem("subscribed_stations") || "[]"
            );
            expect(stored.find((s: { id: string }) => s.id === "ABC123")).toBeDefined();
        });

        it("falls back to localStorage-only when OneSignal removeTag throws", async () => {
            await subscribeToStation("ABC123", "Test Station");
            mockRemoveTag.mockRejectedValueOnce(
                new Error("OneSignal not initialized")
            );

            // Should not throw
            await unsubscribeFromStation("ABC123");

            // localStorage should still be updated
            const stored = JSON.parse(
                localStorage.getItem("subscribed_stations") || "[]"
            );
            expect(stored.find((s: { id: string }) => s.id === "ABC123")).toBeUndefined();
        });
    });

    describe("handles rapid toggle", () => {
        it("processes rapid subscribe/unsubscribe correctly with final state", async () => {
            // Rapid toggle: subscribe -> unsubscribe -> subscribe
            await subscribeToStation("ABC123", "Test Station");
            await unsubscribeFromStation("ABC123");
            await subscribeToStation("ABC123", "Test Station");

            const stored = JSON.parse(
                localStorage.getItem("subscribed_stations") || "[]"
            );
            expect(stored.find((s: { id: string }) => s.id === "ABC123")).toBeDefined();
            expect(isSubscribedToStation("ABC123")).toBe(true);
        });

        it("handles concurrent operations without corruption", async () => {
            // Fire multiple subscribes simultaneously
            await Promise.all([
                subscribeToStation("ST1", "Station 1"),
                subscribeToStation("ST2", "Station 2"),
                subscribeToStation("ST3", "Station 3"),
            ]);

            const result = getSubscribedStationIds();
            expect(result).toContain("ST1");
            expect(result).toContain("ST2");
            expect(result).toContain("ST3");
            expect(result).toHaveLength(3);
        });
    });

    describe("reconcileTagsWithLocalStorage", () => {
        it("adds OneSignal tags missing from localStorage", async () => {
            // OneSignal has a tag that localStorage does not
            mockGetTags.mockResolvedValue({
                station_ABC123: "true",
                station_DEF456: "true",
            });

            await reconcileTagsWithLocalStorage();

            const result = getSubscribedStations();
            expect(result).toEqual([
                { id: "ABC123", name: "Unknown Station" },
                { id: "DEF456", name: "Unknown Station" },
            ]);
        });

        it("re-adds OneSignal tags for localStorage entries missing from OneSignal", async () => {
            // localStorage has a station but OneSignal does not have the tag
            await subscribeToStation("ABC123", "Test Station");
            vi.clearAllMocks();
            mockGetTags.mockResolvedValue({}); // No tags in OneSignal

            await reconcileTagsWithLocalStorage();

            expect(mockAddTag).toHaveBeenCalledWith("station_ABC123", "true");
        });

        it("does not duplicate entries when both sides are in sync", async () => {
            await subscribeToStation("ABC123", "Test Station");
            vi.clearAllMocks();
            mockGetTags.mockResolvedValue({ station_ABC123: "true" });

            await reconcileTagsWithLocalStorage();

            const result = getSubscribedStations();
            expect(
                result.filter((s) => s.id === "ABC123")
            ).toHaveLength(1);
        });

        it("handles getTags failure gracefully", async () => {
            mockGetTags.mockRejectedValue(new Error("SDK not ready"));

            // Should not throw
            await reconcileTagsWithLocalStorage();

            // localStorage unchanged
            const result = getSubscribedStations();
            expect(result).toEqual([]);
        });
    });
});
