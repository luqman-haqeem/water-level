/**
 * HTTP client for the JPS Selangor API.
 *
 * Must only be called from the Node runtime (see `sync/jpsFetch.ts`). Since
 * mid-September 2026 the JPS server negotiates nothing but TLS 1.2 with the CBC
 * suite ECDHE-RSA-AES256-SHA384. Convex's default runtime uses rustls, which
 * does not implement CBC suites, so every fetch from there dies with
 * "tls handshake eof". Node's OpenSSL still accepts the suite.
 *
 * JPS is also slow (15–30s per request) and drops a share of handshakes, hence
 * the per-attempt timeout and retries.
 */

export const JPS_BASE_URL = "https://infobanjirjps.selangor.gov.my/JPSAPI/api";

// Paths are joined onto a fixed host, so only allow plain path segments — no
// scheme, protocol-relative prefix, dot segments or query string.
const JPS_PATH = /^(\/[A-Za-z0-9_-]+)+$/;

export interface FetchJpsOptions {
    fetchImpl?: typeof fetch;
    attempts?: number;
    timeoutMs?: number;
    backoffMs?: number;
}

class NonRetryableError extends Error {}

export async function fetchJpsJson(
    path: string,
    {
        fetchImpl = fetch,
        attempts = 3,
        timeoutMs = 60_000,
        backoffMs = 2_000,
    }: FetchJpsOptions = {}
): Promise<unknown> {
    if (!JPS_PATH.test(path)) {
        throw new Error(`Invalid JPS path: ${path}`);
    }

    const url = `${JPS_BASE_URL}${path}`;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const response = await fetchImpl(url, {
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (!response.ok) {
                const error = new Error(`HTTP ${response.status} from ${url}`);
                if (response.status < 500) throw new NonRetryableError(error.message);
                throw error;
            }
            return await response.json();
        } catch (error) {
            if (error instanceof NonRetryableError) throw error;
            lastError = error;
            if (attempt < attempts && backoffMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
            }
        }
    }

    throw new Error(
        `JPS request failed after ${attempts} attempts: ${url}: ${String(lastError)}`
    );
}
