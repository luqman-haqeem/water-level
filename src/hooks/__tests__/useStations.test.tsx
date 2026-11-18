import { renderHook } from "@testing-library/react";
import { useStations, STATIONS_CACHE_KEY } from "@/hooks/useStations";

const mockUseQuery = vi.fn();

vi.mock("convex/react", () => ({
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

const station = (id: string, level: number) => ({
    id,
    station_name: `Station ${id}`,
    districts: { name: "Gombak" },
    current_levels: {
        current_level: level,
        updated_at: "2026-11-06T14:00:00Z",
        alert_level: "0",
    },
    cameras: null,
    normal_water_level: 1,
    alert_water_level: 2,
    warning_water_level: 3,
    danger_water_level: 4,
    station_status: true,
});

describe("useStations", () => {
    beforeEach(() => {
        localStorage.clear();
        mockUseQuery.mockReset();
    });

    it("is loading when there is neither live data nor a cache", () => {
        mockUseQuery.mockReturnValue(undefined);

        const { result } = renderHook(() => useStations());

        expect(result.current.data).toBeUndefined();
        expect(result.current.isLoading).toBe(true);
    });

    it("renders the cached list while the Convex query is still loading", () => {
        const cached = [station("a", 1.5)];
        localStorage.setItem(STATIONS_CACHE_KEY, JSON.stringify(cached));
        mockUseQuery.mockReturnValue(undefined);

        const { result } = renderHook(() => useStations());

        expect(result.current.data).toEqual(cached);
        expect(result.current.isLoading).toBe(false);
    });

    it("prefers live data over the cache and stores it for the next visit", () => {
        localStorage.setItem(
            STATIONS_CACHE_KEY,
            JSON.stringify([station("a", 1.5)])
        );
        const live = [station("a", 2.5), station("b", 0.4)];
        mockUseQuery.mockReturnValue(live);

        const { result } = renderHook(() => useStations());

        expect(result.current.data).toBe(live);
        expect(
            JSON.parse(localStorage.getItem(STATIONS_CACHE_KEY)!)
        ).toEqual(live);
    });

    it.each([
        ["invalid JSON", "{not json"],
        ["a non-array", JSON.stringify({ stations: [] })],
        ["rows in an older shape", JSON.stringify([{ id: "a", name: "A" }])],
    ])("ignores a cache holding %s", (_label, stored) => {
        localStorage.setItem(STATIONS_CACHE_KEY, stored);
        mockUseQuery.mockReturnValue(undefined);

        const { result } = renderHook(() => useStations());

        expect(result.current.data).toBeUndefined();
        expect(result.current.isLoading).toBe(true);
    });
});
