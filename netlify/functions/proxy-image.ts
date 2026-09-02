import type { Handler, HandlerEvent } from "@netlify/functions";

/**
 * Proxies a JPS CCTV still image through our own origin.
 *
 * SECURITY: the camera id is attacker-controlled (it arrives from the query
 * string or the URL path), so it is interpolated into an outbound URL and must
 * be treated as hostile. Previously it was used unvalidated, which made this an
 * open proxy for arbitrary paths on the upstream host:
 *
 *   /api/proxy-image/../../../../admin/login.aspx?
 *     -> http://infobanjirjps.selangor.gov.my/admin/login.aspx?.jpg
 *
 * WHATWG URL parsing collapses `..` segments, and a bare `?` pushes the `.jpg`
 * suffix into the query string, so neither the directory prefix nor the
 * extension constrained the request. The response was then returned to the
 * caller labelled `image/jpeg` regardless of what came back.
 *
 * Every JPS camera id is a bare integer (`cameraJPS.id.toString()` in
 * convex/sync/cameraUpdater.ts), so an exact numeric match is a sufficient and
 * very cheap allowlist. It rejects path traversal, `?`/`#`/`@`, percent
 * encoding, protocol-relative prefixes, and NUL bytes in one check.
 */

const UPSTREAM_BASE =
    "https://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image";

/** JPS camera ids are bare integers; anything else is not a camera id. */
const CAMERA_ID_PATTERN = /^[0-9]{1,10}$/;

/** Cap the buffered response. Base64 expands by ~33%, so this is ~6.7MB in memory. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const UPSTREAM_TIMEOUT_MS = 10_000;

const jsonError = (statusCode: number, error: string) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error }),
});

/** Reads the camera id from `?id=` or the last path segment. */
function extractCameraId(event: HandlerEvent): string | undefined {
    const fromQuery = event.queryStringParameters?.id;
    if (fromQuery) return fromQuery;

    // /api/proxy-image/CAMERA_ID or /.netlify/functions/proxy-image/CAMERA_ID
    const segments = event.path.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    return last && last !== "proxy-image" ? last : undefined;
}

const handler: Handler = async (event: HandlerEvent) => {
    const id = extractCameraId(event);

    if (!id) {
        return jsonError(400, "Missing camera ID");
    }

    if (!CAMERA_ID_PATTERN.test(id)) {
        // Deliberately does not echo `id` back, to avoid reflecting attacker
        // input into a response body.
        return jsonError(400, "Invalid camera ID");
    }

    try {
        const upstream = await fetch(`${UPSTREAM_BASE}/${id}.jpg`, {
            // Do not follow redirects: a 302 from the upstream would otherwise
            // let it (or anyone able to influence it) point this fetch at an
            // arbitrary host, reintroducing SSRF.
            redirect: "error",
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });

        if (!upstream.ok) {
            // Collapse upstream status codes rather than mirroring them, so this
            // endpoint cannot be used to probe which upstream paths exist.
            return jsonError(502, "Failed to fetch image");
        }

        const contentType = upstream.headers.get("content-type") ?? "";
        if (!contentType.startsWith("image/")) {
            return jsonError(502, "Upstream did not return an image");
        }

        // Reject oversized bodies before buffering when the length is advertised.
        const advertised = Number(upstream.headers.get("content-length"));
        if (Number.isFinite(advertised) && advertised > MAX_IMAGE_BYTES) {
            return jsonError(502, "Image too large");
        }

        const buffer = await upstream.arrayBuffer();
        if (buffer.byteLength > MAX_IMAGE_BYTES) {
            return jsonError(502, "Image too large");
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "image/jpeg",
                "Cache-Control": "public, max-age=300",
                "X-Content-Type-Options": "nosniff",
            },
            body: Buffer.from(buffer).toString("base64"),
            isBase64Encoded: true,
        };
    } catch (error) {
        // Log server-side only; the client gets a generic message.
        console.error("Error fetching camera image:", error);
        return jsonError(502, "Failed to fetch image");
    }
};

export { handler };
