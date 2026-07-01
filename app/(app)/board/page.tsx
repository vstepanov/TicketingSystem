/**
 * Board route (plan §5.7, wireframe-1).
 *
 * Lives inside the guarded `(app)` route group so it inherits the auth bootstrap
 * (AuthProvider `requireAuth`) and the AppShell chrome (header/nav/user menu).
 * The screen body is the client component {@link BoardScreen}, which owns the
 * TanStack Query data access, the filters, and the accessible drag-and-drop.
 * Because it reads the `teamId` query param via `useSearchParams`, Next 15
 * requires a Suspense boundary, provided here.
 */
import { Suspense } from "react";

import { BoardScreen } from "@/ui/board/BoardScreen";

export default function BoardPage() {
  return (
    <Suspense fallback={null}>
      <BoardScreen />
    </Suspense>
  );
}
