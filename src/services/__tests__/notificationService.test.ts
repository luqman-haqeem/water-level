import {
    subscribeToStation,
    unsubscribeFromStation,
    getSubscribedStations,
    getSubscribedStationIds,
    isSubscribedToStation,
    reconcileTagsWithLocalStorage,
} from "@/services/notificationService";

// Mock Notification API (not available in jsdom)
Object.defineProperty(globalThis, 'Notification', {
    value: { permission: 'granted' },
    writable: true,
});

const mockTrack = vi.fn();
vi.mock("@/lib/analytics", () => ({
    track: (...args: unknown[]) => mockTrack(...args),
}));

// Mock the react-onesignal module
const mockAddTag = vi.fn().mockResolvedValue(undefined);
const mockRemoveTag = vi.fn().mockResolvedValue(undefined);
const mockOptIn = vi.fn().mockResolvedValue(undefined);
const mockGetTags = vi.fn().mockResolvedValue({});

vi.mock("react-onesignal", () => {
    // A successful optIn leaves the device opted in, like the real SDK.
    const PushSubscription = {
        optedIn: false,
        optIn: async (...args: unknown[]) => {
            await mockOptIn(...args);
            PushSubscription.optedIn = true;
        },
    };
    return {
    default: {
        User: {
            addTag: (...args: unknown[]) => mockAddTag(...args),
            removeTag: (...args: unknown[]) => mockRemoveTag(...args),
            getTags: (...args: unknown[]) => mockGetTags(...args),
            PushSubscription,
        },
        Notifications: {
            permission: true,
        },
    },
    };
});

async function pushSubscription() {
    const OneSignal = await import("react-onesignal");
    return OneSignal.default.User.PushSubscription as { optedIn: boolean };
}

function storedIds(): string[] {
    return JSON.parse(localStorage.getItem("subscribed_stations") || "[]")
        .map((s: { id: string }) => s.id);
}

describe("notificationService", () => {
    beforeEach(async () => {
        localStorage.clear();
        vi.clearAllMocks();
        (await pushSubscription()).optedIn = false;
        (globalThis as { Notification: { permission: string } }).Notification.permission = "granted";
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
                { id: "ABC123", name: "Sg Klang at Midlands", subscribedAt: expect.any(Number) },
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
                { id: "ABC123", name: "Unknown Station", subscribedAt: expect.any(Number) },
            ]);
        });
    });

    describe("subscribeToStation reports success only for a real subscription", () => {
        it("returns granted when opt-in succeeds", async () => {
            const result = await subscribeToStation("ABC123", "Test Station");
            expect(result).toEqual({ permissionGranted: true });
            expect(storedIds()).toContain("ABC123");
        });

        it("fails and rolls back when permission is denied", async () => {
            (globalThis as { Notification: { permission: string } }).Notification.permission = "denied";

            const result = await subscribeToStation("ABC123", "Test Station");

            expect(result).toEqual({ permissionGranted: false, reason: "denied" });
            expect(storedIds()).not.toContain("ABC123");
            expect(mockAddTag).not.toHaveBeenCalled();
        });

        it("fails and rolls back when the prompt is dismissed (still not opted in)", async () => {
            (globalThis as { Notification: { permission: string } }).Notification.permission = "default";
            const ps = await pushSubscription();
            // optIn resolves but the device never becomes opted in
            const original = (ps as unknown as { optIn: () => Promise<void> }).optIn;
            (ps as unknown as { optIn: () => Promise<void> }).optIn = async () => {};

            const result = await subscribeToStation("ABC123", "Test Station");

            (ps as unknown as { optIn: () => Promise<void> }).optIn = original;
            expect(result).toEqual({ permissionGranted: false, reason: "not-subscribed" });
            expect(storedIds()).not.toContain("ABC123");
            expect(mockAddTag).not.toHaveBeenCalled();
        });
    });

    describe("analytics events (#75)", () => {
        const events = () => mockTrack.mock.calls.map((c) => c[0]);

        it("tracks requested + granted + station_watched when the prompt is accepted", async () => {
            (globalThis as { Notification: { permission: string } }).Notification.permission = "default";
            mockOptIn.mockImplementationOnce(async () => {
                (globalThis as { Notification: { permission: string } }).Notification.permission = "granted";
            });

            await subscribeToStation("ABC123", "Test Station", "Petaling");

            expect(events()).toEqual(["permission_requested", "permission_granted", "station_watched"]);
            expect(mockTrack).toHaveBeenCalledWith("station_watched", { stationId: "ABC123", district: "Petaling" });
        });

        it("tracks permission_denied (not dismissed) when the user blocks", async () => {
            (globalThis as { Notification: { permission: string } }).Notification.permission = "default";
            mockOptIn.mockImplementationOnce(async () => {
                (globalThis as { Notification: { permission: string } }).Notification.permission = "denied";
            });

            await subscribeToStation("ABC123", "Test Station");

            expect(mockTrack).toHaveBeenCalledWith("permission_denied", { stationId: "ABC123", dismissed: false });
            expect(events()).not.toContain("station_watched");
        });

        it("does not track permission events when permission was already granted", async () => {
            await subscribeToStation("ABC123", "Test Station");

            expect(events()).toEqual(["station_watched"]);
        });

        it("does not re-track station_watched for an already-stored station", async () => {
            await subscribeToStation("ABC123", "Test Station");
            mockTrack.mockClear();

            await subscribeToStation("ABC123", "Test Station");

            expect(events()).not.toContain("station_watched");
        });

        it("tracks station_unwatched with daysWatched", async () => {
            const now = Date.now();
            localStorage.setItem("subscribed_stations", JSON.stringify([
                { id: "ABC123", name: "A", subscribedAt: now - 3.5 * 24 * 60 * 60 * 1000 },
                { id: "OLD", name: "Legacy" },
            ]));

            await unsubscribeFromStation("ABC123");
            await unsubscribeFromStation("OLD");
            await unsubscribeFromStation("NOT_WATCHED");

            expect(mockTrack.mock.calls).toEqual([
                ["station_unwatched", { stationId: "ABC123", daysWatched: 3 }],
                ["station_unwatched", { stationId: "OLD", daysWatched: null }],
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
                { id: "ABC123", name: "Station A", subscribedAt: expect.any(Number) },
                { id: "DEF456", name: "Station B", subscribedAt: expect.any(Number) },
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
        it("reports failure and rolls back localStorage when OneSignal throws", async () => {
            mockAddTag.mockRejectedValueOnce(
                new Error("OneSignal not initialized")
            );

            // Should not throw
            const result = await subscribeToStation("ABC123", "Test Station");

            // A station that cannot alert this device must not be listed (#78)
            expect(result).toEqual({ permissionGranted: false, reason: "unavailable" });
            expect(storedIds()).not.toContain("ABC123");
        });

        it("keeps an existing entry when a re-subscribe fails", async () => {
            await subscribeToStation("ABC123", "Test Station");
            mockAddTag.mockRejectedValueOnce(new Error("transient"));

            await subscribeToStation("ABC123", "Test Station");

            expect(storedIds()).toContain("ABC123");
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
