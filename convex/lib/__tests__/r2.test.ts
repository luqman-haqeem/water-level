// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { createR2Client, r2ConfigFromEnv } from "../r2";

const config = {
    accountId: "acct123",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "secretexample",
    bucket: "riverlevel-snapshot-dev",
};

describe("r2ConfigFromEnv", () => {
    it("reads the four R2_* variables", () => {
        expect(
            r2ConfigFromEnv({
                R2_ACCOUNT_ID: "a",
                R2_ACCESS_KEY_ID: "b",
                R2_SECRET_ACCESS_KEY: "c",
                R2_BUCKET: "d",
            })
        ).toEqual({ accountId: "a", accessKeyId: "b", secretAccessKey: "c", bucket: "d" });
    });

    it("throws naming every missing variable", () => {
        expect(() => r2ConfigFromEnv({ R2_ACCOUNT_ID: "a" })).toThrow(
            /R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET/
        );
    });
});

describe("createR2Client.putObject", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("PUTs a SigV4-signed request to the bucket URL with content headers", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await createR2Client(config).putObject("stations.json", '{"a":1}', {
            contentType: "application/json",
            cacheControl: "public, max-age=60",
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const request = fetchMock.mock.calls[0][0] as Request;
        expect(request.url).toBe(
            "https://acct123.r2.cloudflarestorage.com/riverlevel-snapshot-dev/stations.json"
        );
        expect(request.method).toBe("PUT");
        expect(request.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
        expect(request.headers.get("content-type")).toBe("application/json");
        expect(request.headers.get("cache-control")).toBe("public, max-age=60");
        expect(request.headers.get("x-amz-content-sha256")).toBeTruthy();
    });

    it("throws with status and key on a non-2xx response", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 403 })));
        await expect(
            createR2Client(config).putObject("cam/1.jpg", new Uint8Array([1, 2, 3]), {
                contentType: "image/jpeg",
                cacheControl: "public, max-age=300",
            })
        ).rejects.toThrow(/R2 PUT cam\/1.jpg failed: HTTP 403/);
    });
});
