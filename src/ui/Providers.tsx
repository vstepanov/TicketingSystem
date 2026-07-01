"use client";

/**
 * Providers (plan §5, §2.1) — root client-side provider tree.
 *
 * Wraps the app in a single TanStack Query client (created once per mount via
 * `useState` so it survives re-renders but is isolated per browser session) and
 * a {@link ToastProvider} so any screen can raise success/error toasts (§5.3).
 * Auth is provided per route group (the `(app)` layout uses an AuthProvider with
 * `requireAuth`), so this root provider intentionally only owns query + toast state.
 */
import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { createQueryClient } from "@/lib/query";
import { ToastProvider } from "./Toast";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
