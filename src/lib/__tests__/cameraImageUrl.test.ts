import { describe, it, expect } from "vitest";
import { cameraImageUrl } from "@/lib/cameraImageUrl";

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
