import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const useSnapshotMock = vi.fn();
vi.mock("@/hooks/useSnapshot", () => ({ useSnapshot: (...args: unknown[]) => useSnapshotMock(...args) }));

import { DataFreshnessBanner } from "@/components/DataFreshnessBanner";

const base = { isLoading: false, fetchedAt: 1, fromCache: false };

describe("DataFreshnessBanner", () => {
    beforeEach(() => useSnapshotMock.mockReset());

    it("renders nothing when fresh", () => {
        useSnapshotMock.mockReturnValue({ ...base, error: null, data: { status: "ok", syncedAt: new Date().toISOString(), attemptedAt: new Date().toISOString(), jpsLastUpdate: new Date().toISOString() } });
        const { container } = render(<DataFreshnessBanner />);
        expect(container).toBeEmptyDOMElement();
    });

    it("shows the lagging message with role=status", () => {
        const old = new Date(Date.now() - 2 * 3_600_000).toISOString();
        useSnapshotMock.mockReturnValue({ ...base, error: null, data: { status: "ok", syncedAt: old, attemptedAt: new Date().toISOString(), jpsLastUpdate: old } });
        render(<DataFreshnessBanner />);
        expect(screen.getByRole("status")).toHaveTextContent(/JPS last reported/i);
    });

    it("shows the upstream-down message with role=alert", () => {
        useSnapshotMock.mockReturnValue({ ...base, error: null, data: { status: "upstream_error", syncedAt: new Date().toISOString(), attemptedAt: new Date().toISOString(), jpsLastUpdate: null, failingSince: new Date().toISOString() } });
        render(<DataFreshnessBanner />);
        expect(screen.getByRole("alert")).toHaveTextContent(/Can't reach JPS/i);
    });

    it("shows the unreachable message when meta fails to load", () => {
        useSnapshotMock.mockReturnValue({ ...base, error: new Error("HTTP 502"), data: undefined });
        render(<DataFreshnessBanner />);
        expect(screen.getByRole("status")).toHaveTextContent(/Can't reach the data server/i);
    });
});
