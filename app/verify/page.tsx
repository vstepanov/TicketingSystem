/**
 * Email verification result screen (plan §5.6, wireframe 2 — right card).
 *
 * Public route reached from the emailed link `/verify?token=...`. The token in
 * the URL is the single-use verification token — the only token permitted in a
 * URL (§4.1, §11.9). Because the inner component reads the query string via
 * `useSearchParams`, Next 15 requires it to be wrapped in a Suspense boundary,
 * which this server page provides.
 */
import { Suspense } from "react";

import { AuthCard } from "@/ui";

import { VerifyResult } from "./verify-result";

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Verifying…" subtitle="Please wait.">
          <p role="status" style={{ margin: 0, color: "var(--color-text-muted)" }}>
            Loading…
          </p>
        </AuthCard>
      }
    >
      <VerifyResult />
    </Suspense>
  );
}
