import { getLocationPermissionState } from "@/utils/locationUtils";

describe("getLocationPermissionState", () => {
    const originalPermissions = Object.getOwnPropertyDescriptor(navigator, "permissions");
    const getCurrentPosition = vi.fn();

    beforeEach(() => {
        getCurrentPosition.mockReset();
        Object.defineProperty(navigator, "geolocation", {
            value: { getCurrentPosition },
            configurable: true,
        });
    });

    afterEach(() => {
        if (originalPermissions) {
            Object.defineProperty(navigator, "permissions", originalPermissions);
        } else {
            delete (navigator as { permissions?: unknown }).permissions;
        }
    });

    const mockPermissions = (query: () => Promise<{ state: PermissionState }>) => {
        Object.defineProperty(navigator, "permissions", {
            value: { query },
            configurable: true,
        });
    };

    it.each<PermissionState>(["granted", "denied", "prompt"])(
        "returns the browser's %s state without requesting a position",
        async (state) => {
            mockPermissions(async () => ({ state }));

            await expect(getLocationPermissionState()).resolves.toBe(state);
            expect(getCurrentPosition).not.toHaveBeenCalled();
        }
    );

    it("treats a failing permissions query as undecided instead of prompting", async () => {
        mockPermissions(async () => {
            throw new Error("unsupported");
        });

        await expect(getLocationPermissionState()).resolves.toBe("prompt");
        expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it("treats a missing Permissions API as undecided instead of prompting", async () => {
        // jsdom does not implement navigator.permissions
        expect("permissions" in navigator).toBe(false);

        await expect(getLocationPermissionState()).resolves.toBe("prompt");
        expect(getCurrentPosition).not.toHaveBeenCalled();
    });
});
