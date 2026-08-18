import type { Handler, HandlerEvent } from "@netlify/functions";

const handler: Handler = async (event: HandlerEvent) => {
    // Try to parse camera ID from the path first, then fall back to query string
    let id = event.queryStringParameters?.id;

    if (!id) {
        // Parse from path: /api/proxy-image/CAMERA_ID or /.netlify/functions/proxy-image/CAMERA_ID
        const pathSegments = event.path.split("/").filter(Boolean);
        const lastSegment = pathSegments[pathSegments.length - 1];
        if (lastSegment && lastSegment !== "proxy-image") {
            id = lastSegment;
        }
    }

    if (!id) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Missing camera ID" }),
        };
    }

    const imageUrl = `http://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image/${id}.jpg`;

    try {
        const response = await fetch(imageUrl);

        if (!response.ok) {
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: "Failed to fetch image" }),
            };
        }

        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "image/jpeg",
                "Cache-Control": "public, max-age=300",
            },
            body: base64,
            isBase64Encoded: true,
        };
    } catch (error) {
        console.error("Error fetching image:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to fetch image" }),
        };
    }
};

export { handler };
