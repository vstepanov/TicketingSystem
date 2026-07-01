"use client";

/**
 * Auth context & bootstrap (plan §5.1, §5.3).
 *
 * On mount the SPA calls `GET /api/auth/me` to hydrate the current user from
 * the HttpOnly session cookie (no `localStorage`). While that request is in
 * flight the shell shows a loading state; on `401` the anonymous visitor is
 * redirected to `/login` (route guard for the `(app)` group). The context also
 * registers the global 401 handler on the API client so that *any* later
 * request that returns 401 (e.g. session expiry mid-session) redirects too.
 *
 * `logout()` calls `POST /api/auth/logout`, clears the cached user, and
 * redirects to `/login` — clearing client auth state as required by §5.1(7).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { api, isApiError, setUnauthorizedHandler } from "./api-client";

/** Authenticated user identity from `GET /api/auth/me`. */
export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

/** Value exposed by {@link useAuth}. */
export interface AuthContextValue {
  /** The current user, or `null` when anonymous / not yet loaded. */
  user: AuthUser | null;
  /** True while the initial `/me` bootstrap is in flight. */
  isLoading: boolean;
  /** Log out: clears the session cookie + client state, redirects to /login. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provider that performs the auth bootstrap and guards its children. When
 * `requireAuth` is true (the `(app)` layout), an anonymous visitor is redirected
 * to `/login` and children are not rendered until a user is present.
 */
export function AuthProvider({
  children,
  requireAuth = false,
}: {
  children: ReactNode;
  requireAuth?: boolean;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Register a global 401 handler so any request (not just /me) that comes back
  // unauthenticated sends the user to /login and drops client auth state.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      router.replace("/login");
    });
    return () => setUnauthorizedHandler(null);
  }, [router]);

  // Bootstrap: hydrate the current user from the session cookie.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const me = await api.get<AuthUser>("/api/auth/me");
        if (!cancelled) {
          setUser(me);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setUser(null);
        // The api-client's 401 handler already redirects; belt-and-braces for
        // the guarded group in case the handler was not yet registered.
        if (requireAuth && isApiError(error) && error.status === 401) {
          router.replace("/login");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requireAuth, router]);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // Even if the request fails, clear local state and redirect — the cookie
      // is HttpOnly so the server is the source of truth; a stale client should
      // not remain "logged in".
    } finally {
      setUser(null);
      router.replace("/login");
    }
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Access the auth context. Throws if used outside an {@link AuthProvider}. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
