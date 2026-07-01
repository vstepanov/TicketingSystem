/**
 * Teams route (plan §5.10, wireframe-4).
 *
 * Lives inside the guarded `(app)` route group so it inherits the auth bootstrap
 * (AuthProvider `requireAuth`) and the AppShell chrome (header/nav/user menu).
 * The screen body is the client component {@link TeamsScreen}, which owns the
 * TanStack Query data access and all interactive state (create/rename/delete).
 */
import { TeamsScreen } from "@/ui/teams/TeamsScreen";

export default function TeamsPage() {
  return <TeamsScreen />;
}
