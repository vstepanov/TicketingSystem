/**
 * Authenticated route-group layout (plan §5.1, §5.3).
 *
 * Every screen under `app/(app)/**` (Board, Teams, Epics, Tickets) is wrapped
 * here in:
 *   - an {@link AuthProvider} in `requireAuth` mode, which bootstraps the
 *     current user via `GET /api/auth/me` and redirects anonymous visitors to
 *     `/login` (the route guard); and
 *   - the {@link AppShell}, which renders the persistent header (brand, nav,
 *     user menu) and the active route in the body.
 *
 * The root layout already supplies the TanStack Query provider, so this layout
 * only adds auth + chrome.
 */
import type { ReactNode } from "react";

import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/ui/AppShell";

export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider requireAuth>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
