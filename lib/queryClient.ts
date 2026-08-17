import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Water level data updates every 15 min, so 30s staleTime is reasonable
            staleTime: 30 * 1000,
            // Keep unused data in cache for 5 minutes
            gcTime: 5 * 60 * 1000,
            // Refetch when window regains focus for fresh data
            refetchOnWindowFocus: true,
            // Retry failed requests up to 2 times
            retry: 2,
        },
    },
});
