export interface FetchRetryOptions {
    timeoutMs?: number;
    retries?: number;
    backoffMs?: number;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * fetch() with a hard timeout (AbortController) and simple fixed-backoff retries.
 * Non-2xx responses count as failures. Resolves with the first ok Response.
 */
export async function fetchWithRetry(url: string, options: FetchRetryOptions = {}): Promise<Response> {
    const {
        timeoutMs = 20_000,
        retries = 1,
        backoffMs = 5_000,
        fetchImpl = fetch,
        sleep = defaultSleep,
    } = options;

    let lastError: unknown = new Error(`fetchWithRetry: no attempts made for ${url}`);

    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(url, { signal: controller.signal });
            if (response.ok) return response;
            lastError = new Error(`HTTP ${response.status} for ${url}`);
        } catch (error) {
            lastError = error;
        } finally {
            clearTimeout(timer);
        }
        if (attempt < retries) await sleep(backoffMs);
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
