/**
 * Ticket detail / edit route (plan §5.8, §5.9, wireframe-3).
 *
 * Lives inside the guarded `(app)` route group so it inherits the auth bootstrap
 * (AuthProvider `requireAuth`) and the AppShell chrome (header/nav/user menu).
 * Next 15 delivers dynamic route params asynchronously, so this server component
 * awaits `params` and hands the ticket id to the client component
 * {@link TicketDetailScreen}, which owns the TanStack Query data access, the
 * form, the delete flow, and the embedded comments panel.
 */
import { TicketDetailScreen } from "@/ui/tickets/TicketDetailScreen";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TicketDetailScreen ticketId={id} />;
}
