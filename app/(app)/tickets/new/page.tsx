/**
 * Ticket create route (plan §5.8, wireframe-3).
 *
 * Lives inside the guarded `(app)` route group so it inherits the auth bootstrap
 * (AuthProvider `requireAuth`) and the AppShell chrome (header/nav/user menu).
 * The screen body is the client component {@link CreateTicketScreen}, which owns
 * the TanStack Query data access and the form. Because it reads the `teamId`
 * query param via `useSearchParams`, Next 15 requires a Suspense boundary,
 * provided here.
 */
import { Suspense } from "react";

import { CreateTicketScreen } from "@/ui/tickets/CreateTicketScreen";

export default function NewTicketPage() {
  return (
    <Suspense fallback={null}>
      <CreateTicketScreen />
    </Suspense>
  );
}
