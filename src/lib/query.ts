/**
 * TanStack Query client configuration (plan §5, §2.1).
 *
 * Server-state cache for the SPA. Defaults chosen for a small internal tool:
 *   - `refetchOnWindowFocus: true` — refresh data when the user returns to the
 *     tab (plan §2.1 "refetch-on-focus ok"); browser refresh always re-fetches
 *     from the API so no `localStorage` system-of-record is needed.
 *   - modest `staleTime` to avoid refetch storms during rapid navigation.
 *   - do not retry on 4xx `ApiError`s (validation/auth/not-found are terminal);
 *     retry once on other (network/5xx) failures.
 *
 * A factory is exported so each browser session (and each test) gets an isolated
 * client; the app shell creates exactly one per mount and holds it in state.
 */
import { QueryClient } from "@tanstack/react-query";

import { isApiError } from "./api-client";

const STALE_TIME_MS = 30_000;

/** Create a fresh, configured {@link QueryClient}. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          // 4xx errors are deterministic — never retry them.
          if (isApiError(error) && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 1;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
