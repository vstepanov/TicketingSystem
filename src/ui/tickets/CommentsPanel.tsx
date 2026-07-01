"use client";

/**
 * CommentsPanel (plan §5.9 wireframe-3, right column) — the ticket comments panel.
 *
 * Composition:
 *   - Header "Comments" + a count Pill.
 *   - The comment list (oldest first, as the API returns them, §4.7): each card
 *     shows the author email (bold) with a right-aligned UTC timestamp, then the
 *     body. Empty → "No comments yet."
 *   - An "Add comment" Textarea + "Post comment" button. On post it calls
 *     `POST /api/tickets/{id}/comments`; the hook invalidates ONLY the comments
 *     query so the list refetches while the ticket (and hence board order) is
 *     untouched (§5.9). Empty body → inline "Comment cannot be empty".
 *
 * States (§5.3): loading (spinner), error (inline + Retry), empty, success
 * (posted comment appears after refetch; button spinner while posting). Client
 * validation is UX-only; the backend re-validates (SHARED RULES/§4).
 */
import { useState, type CSSProperties, type FormEvent } from "react";

import { Button } from "@/ui/Button";
import { Pill } from "@/ui/Pill";
import { Spinner } from "@/ui/Spinner";
import { Textarea } from "@/ui/Textarea";
import { useToast } from "@/ui/Toast";
import { isApiError } from "@/lib/api-client";
import { formatUtc, useComments, usePostComment } from "./use-ticket";

const PANEL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
  padding: "var(--space-4)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
};

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
};

const HEADING_STYLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-lg)",
  fontWeight: 600,
};

const LIST_STYLE: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};

const COMMENT_STYLE: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-3)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-1)",
};

const COMMENT_HEAD_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "var(--space-2)",
};

const AUTHOR_STYLE: CSSProperties = {
  fontWeight: 600,
  fontSize: "var(--text-sm)",
};

const TIME_STYLE: CSSProperties = {
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
};

const BODY_STYLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-base)",
  whiteSpace: "pre-wrap",
};

const EMPTY_STYLE: CSSProperties = {
  margin: 0,
  color: "var(--color-text-muted)",
  fontSize: "var(--text-base)",
};

const STATUS_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  color: "var(--color-text-muted)",
};

const ERROR_STYLE: CSSProperties = {
  color: "var(--color-danger)",
};

const FORM_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  marginTop: "var(--space-2)",
};

export function CommentsPanel({ ticketId }: { ticketId: string }) {
  const commentsQuery = useComments(ticketId);
  const postComment = usePostComment();
  const toast = useToast();

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const comments = commentsQuery.data ?? [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      setError("Comment cannot be empty");
      return;
    }

    try {
      await postComment.mutateAsync({ ticketId, body: trimmed });
      setDraft("");
      toast.success("Comment posted.");
    } catch (err) {
      if (isApiError(err)) {
        if (err.status === 400) {
          setError(err.fields?.body ?? err.message ?? "Comment cannot be empty");
          return;
        }
        if (err.status === 404) {
          toast.error("That ticket no longer exists.");
          return;
        }
      }
      toast.error("Could not post the comment. Please try again.");
    }
  }

  return (
    <section style={PANEL_STYLE} aria-label="Comments">
      <div style={HEADER_STYLE}>
        <h2 style={HEADING_STYLE}>Comments</h2>
        <Pill>{comments.length}</Pill>
      </div>

      {commentsQuery.isLoading ? (
        <div style={STATUS_STYLE} role="status" aria-live="polite">
          <Spinner /> Loading comments…
        </div>
      ) : commentsQuery.isError ? (
        <div style={ERROR_STYLE} role="alert">
          <p style={{ margin: "0 0 var(--space-2)" }}>
            Could not load comments. Please try again.
          </p>
          <Button
            variant="secondary"
            onClick={() => void commentsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : comments.length === 0 ? (
        <p style={EMPTY_STYLE}>No comments yet.</p>
      ) : (
        <ul style={LIST_STYLE}>
          {comments.map((comment) => (
            <li key={comment.id} style={COMMENT_STYLE}>
              <div style={COMMENT_HEAD_STYLE}>
                <span style={AUTHOR_STYLE}>{comment.author.email}</span>
                <span style={TIME_STYLE}>{formatUtc(comment.createdAt)}</span>
              </div>
              <p style={BODY_STYLE}>{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form style={FORM_STYLE} onSubmit={handleSubmit} noValidate aria-label="Post comment">
        <Textarea
          label="Add comment"
          value={draft}
          error={error}
          disabled={postComment.isPending}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) {
              setError(null);
            }
          }}
        />
        <div>
          <Button type="submit" disabled={postComment.isPending}>
            {postComment.isPending ? "Posting…" : "Post comment"}
          </Button>
        </div>
      </form>
    </section>
  );
}
