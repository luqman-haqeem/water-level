import { useSyncExternalStore } from "react";
import { createSnapshotStore, type SnapshotState, type SnapshotStore } from "@/lib/snapshotStore";
import { requireSnapshotBaseUrl } from "@/lib/snapshotEnv";
import type { SnapshotFileName } from "@/lib/snapshotTypes";

const stores = new Map<SnapshotFileName, SnapshotStore<unknown>>();
const listenerCleanups = new Map<SnapshotFileName, () => void>();

function safeLocalStorage(): Pick<Storage, "getItem" | "setItem"> | null {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        return null;
    }
}

/** One store per file for the whole app; created lazily, started on first use. */
export function getSnapshotStore<T>(file: SnapshotFileName): SnapshotStore<T> {
    let store = stores.get(file);
    if (!store) {
        store = createSnapshotStore<unknown>({
            baseUrl: requireSnapshotBaseUrl(),
            file,
            storage: safeLocalStorage(),
        });
        stores.set(file, store);
        store.start();

        if (typeof document !== "undefined") {
            const onVisible = () => {
                if (document.visibilityState === "visible") void store!.refresh();
            };
            const onFocus = () => void store!.refresh();
            document.addEventListener("visibilitychange", onVisible);
            window.addEventListener("focus", onFocus);
            listenerCleanups.set(file, () => {
                document.removeEventListener("visibilitychange", onVisible);
                window.removeEventListener("focus", onFocus);
            });
        }
    }
    return store as SnapshotStore<T>;
}

export function useSnapshot<T>(file: SnapshotFileName): SnapshotState<T> {
    const store = getSnapshotStore<T>(file);
    return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** Refetch every started store (pull-to-refresh). */
export async function refreshSnapshots(files?: SnapshotFileName[]): Promise<void> {
    const targets = files ? files.flatMap((f) => (stores.has(f) ? [stores.get(f)!] : [])) : [...stores.values()];
    await Promise.all(targets.map((s) => s.refresh()));
}

export function resetSnapshotStoresForTests(): void {
    stores.forEach((s) => s.stop());
    listenerCleanups.forEach((cleanup) => cleanup());
    listenerCleanups.clear();
    stores.clear();
}
