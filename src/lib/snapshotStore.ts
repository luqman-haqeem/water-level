import type { SnapshotFileName } from "./snapshotTypes";

export interface SnapshotState<T> {
    data: T | undefined;
    error: Error | null;
    isLoading: boolean;
    fetchedAt: number | null;
    fromCache: boolean;
}

export interface SnapshotStore<T> {
    subscribe(listener: () => void): () => void;
    getState(): SnapshotState<T>;
    refresh(): Promise<void>;
    start(): void;
    stop(): void;
}

export interface SnapshotStoreOptions {
    baseUrl: string;
    file: SnapshotFileName;
    pollMs?: number;
    maxBackoffMs?: number;
    fetchImpl?: typeof fetch;
    storage?: Pick<Storage, "getItem" | "setItem"> | null;
    now?: () => number;
}

interface Persisted<T> {
    data: T;
    etag: string | null;
    fetchedAt: number;
}

export const DEFAULT_POLL_MS = 120_000;
export const DEFAULT_MAX_BACKOFF_MS = 600_000;

/**
 * Polls `${baseUrl}/${file}.json` with ETag revalidation, keeps the last good
 * payload (also in storage), and backs off on errors. No React, no DOM — the
 * hook layer adds visibility/focus triggers.
 */
export function createSnapshotStore<T>(options: SnapshotStoreOptions): SnapshotStore<T> {
    const {
        baseUrl,
        file,
        pollMs = DEFAULT_POLL_MS,
        maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
        fetchImpl = fetch,
        storage = null,
        now = () => Date.now(),
    } = options;

    const url = `${baseUrl}/${file}.json`;
    const storageKey = `snapshot:${file}`;
    const listeners = new Set<() => void>();

    let state: SnapshotState<T> = { data: undefined, error: null, isLoading: true, fetchedAt: null, fromCache: false };
    let etag: string | null = null;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: Promise<void> | null = null;
    let started = false;

    const setState = (patch: Partial<SnapshotState<T>>) => {
        state = { ...state, ...patch };
        listeners.forEach((listener) => listener());
    };

    const persist = (data: T, fetchedAt: number) => {
        if (!storage) return;
        try {
            const record: Persisted<T> = { data, etag, fetchedAt };
            storage.setItem(storageKey, JSON.stringify(record));
        } catch {
            /* quota or private mode — ignore */
        }
    };

    const hydrate = () => {
        if (!storage) return;
        try {
            const raw = storage.getItem(storageKey);
            if (!raw) return;
            const record = JSON.parse(raw) as Persisted<T>;
            etag = record.etag ?? null;
            setState({ data: record.data, fetchedAt: record.fetchedAt, fromCache: true, isLoading: false });
        } catch {
            /* corrupt cache — ignore */
        }
    };

    const schedule = () => {
        if (!started) return;
        if (timer) clearTimeout(timer);
        const delay = failures === 0 ? pollMs : Math.min(pollMs * 2 ** failures, maxBackoffMs);
        timer = setTimeout(() => void refresh(), delay);
    };

    const doFetch = async () => {
        const headers: Record<string, string> = {};
        if (etag) headers["If-None-Match"] = etag;
        try {
            const response = await fetchImpl(url, { headers, cache: "no-cache" });
            if (response.status === 304) {
                failures = 0;
                setState({ error: null, isLoading: false });
                return;
            }
            if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
            const data = (await response.json()) as T;
            etag = response.headers.get("etag");
            failures = 0;
            const fetchedAt = now();
            setState({ data, error: null, isLoading: false, fetchedAt, fromCache: false });
            persist(data, fetchedAt);
        } catch (error) {
            failures += 1;
            setState({ error: error instanceof Error ? error : new Error(String(error)), isLoading: false });
        } finally {
            schedule();
        }
    };

    const refresh = () => {
        if (!inFlight) {
            inFlight = doFetch().finally(() => {
                inFlight = null;
            });
        }
        return inFlight;
    };

    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getState: () => state,
        refresh,
        start() {
            if (started) return;
            started = true;
            hydrate();
            void refresh();
        },
        stop() {
            started = false;
            if (timer) clearTimeout(timer);
            timer = null;
        },
    };
}
