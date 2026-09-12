import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    cameraImageUrl,
    cameraFrameUrl,
    NO_FRAME_IMAGE,
    type CameraFrameSource,
} from "@/lib/cameraImageUrl";

describe("cameraImageUrl", () => {
    it("points at cam/{id}.jpg on the snapshot host", () => {
        expect(cameraImageUrl("https://cdn.test", "42")).toBe("https://cdn.test/cam/42.jpg");
    });

    it("appends the capture time as a cache-busting query", () => {
        expect(cameraImageUrl("https://cdn.test", "42", "2026-08-29T08:00:00.000Z")).toBe(
            "https://cdn.test/cam/42.jpg?v=2026-08-29T08%3A00%3A00.000Z"
        );
    });

    it("ignores a null capture time and a trailing slash on the base", () => {
        expect(cameraImageUrl("https://cdn.test/", "7", null)).toBe("https://cdn.test/cam/7.jpg");
    });
});

describe("cameraFrameUrl", () => {
    const NOW = new Date("2026-09-12T12:00:00.000Z");
    const fresh = "2026-09-12T11:45:00.000Z"; // 15 min old
    const stale = "2026-09-12T09:00:00.000Z"; // 3 h old
    const jps = (id: string) =>
        `https://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image/${id}.jpg`;
    const camera = (over: Partial<CameraFrameSource> = {}): CameraFrameSource => ({
        jps_camera_id: "25",
        captured_at: fresh,
        img_url: "http://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image/25.jpg",
        ...over,
    });

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterEach(() => vi.useRealTimers());

    it("serves the mirrored frame while it is fresh", () => {
        expect(cameraFrameUrl("https://cdn.test", camera())).toBe(
            "https://cdn.test/cam/25.jpg?v=2026-09-12T11%3A45%3A00.000Z"
        );
    });

    it("goes live to JPS once the mirror stops advancing", () => {
        expect(cameraFrameUrl("https://cdn.test", camera({ captured_at: stale }))).toBe(jps("25"));
    });

    it("treats a missing capture time as stale rather than serving an undated frame", () => {
        expect(cameraFrameUrl("https://cdn.test", camera({ captured_at: null }))).toBe(jps("25"));
    });

    it("upgrades to https, since every published img_url is http and would be blocked", () => {
        const url = cameraFrameUrl("https://cdn.test", camera({ captured_at: stale }));
        expect(url.startsWith("https://")).toBe(true);
    });

    it("builds from jps_camera_id, ignoring whatever the upstream img_url points at", () => {
        const url = cameraFrameUrl(
            "https://cdn.test",
            camera({ captured_at: stale, img_url: "http://evil.test/x.jpg" })
        );
        expect(url).toBe(jps("25"));
    });

    it("falls back to the placeholder for a camera that publishes no live frame", () => {
        // Camera 247 in the live roster has an empty img_url.
        expect(
            cameraFrameUrl("https://cdn.test", camera({ captured_at: stale, img_url: "" }))
        ).toBe(NO_FRAME_IMAGE);
    });

    it("refuses a camera id that is not a bare integer", () => {
        expect(
            cameraFrameUrl("https://cdn.test", camera({ captured_at: stale, jps_camera_id: "../evil" }))
        ).toBe(NO_FRAME_IMAGE);
    });

    it("stays deterministic, so the URL still works as a fullscreen identity key", () => {
        const c = camera({ captured_at: stale });
        const first = cameraFrameUrl("https://cdn.test", c);
        vi.setSystemTime(new Date("2026-09-12T12:05:00.000Z"));
        expect(cameraFrameUrl("https://cdn.test", c)).toBe(first);
    });
});
