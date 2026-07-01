/**
 * Epics route (plan §5.11, wireframe-5).
 *
 * Lives inside the guarded `(app)` route group so it inherits the auth bootstrap
 * (AuthProvider `requireAuth`) and the AppShell chrome (header/nav/user menu).
 * The screen body is the client component {@link EpicsScreen}, which owns the
 * TanStack Query data access and all interactive state (team selector, create,
 * edit, delete). Because it reads the `teamId` query param via
 * `useSearchParams`, Next 15 requires a Suspense boundary, provided here.
 */
import { Suspense } from "react";

import { EpicsScreen } from "@/ui/epics/EpicsScreen";

export default function EpicsPage() {
  return (
    <Suspense fallback={null}>
      <EpicsScreen />
    </Suspense>
  );
}
