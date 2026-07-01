"use client";

/**
 * Toast notifications (plan §5.2, §5.3) — transient success/error feedback.
 *
 * A small provider holds the active toast queue; screens fire toasts via the
 * {@link useToast} hook (`toast.success(...)` / `toast.error(...)`) after a
 * mutation resolves (plan §5.3 "Success: toast + cache invalidation"; "Error:
 * inline field errors + toast for request errors"). Toasts auto-dismiss and are
 * announced via an `aria-live` region.
 *
 * Styling is inline off the design tokens (§5.1). This provider is mounted once
 * inside the app-wide {@link Providers} so every screen can raise toasts.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export type ToastTone = "success" | "error";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

export interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_TIMEOUT_MS = 4000;

const REGION_STYLE: CSSProperties = {
  position: "fixed",
  bottom: "var(--space-5)",
  right: "var(--space-5)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  zIndex: 100,
  maxWidth: "360px",
};

const TOAST_BASE_STYLE: CSSProperties = {
  padding: "var(--space-3) var(--space-4)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-md)",
  fontSize: "var(--text-base)",
  color: "var(--color-text-inverse)",
};

const TONE_STYLE: Record<ToastTone, CSSProperties> = {
  success: { background: "var(--color-success)" },
  error: { background: "var(--color-danger)" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }]);
      if (typeof window !== "undefined") {
        window.setTimeout(() => remove(id), DEFAULT_TIMEOUT_MS);
      }
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message: string) => push("success", message),
      error: (message: string) => push("error", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div style={REGION_STYLE} aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{ ...TOAST_BASE_STYLE, ...TONE_STYLE[t.tone] }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Access the toast API. Throws if used outside a {@link ToastProvider}. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
