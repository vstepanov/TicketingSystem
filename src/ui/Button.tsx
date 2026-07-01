"use client";

/**
 * Button (plan §5.2) — primary / secondary / disabled variants.
 *
 * Monochrome design tokens (§5.1): primary is near-black with white text,
 * secondary is an outlined white button. Styling is inline off CSS custom
 * properties so the component is self-contained (the scaffold has no CSS-module
 * or Tailwind pipeline yet). Fully typed; forwards all native button props.
 */
import type { ButtonHTMLAttributes, CSSProperties } from "react";

export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const BASE_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-2)",
  height: "34px",
  padding: "0 var(--space-4)",
  fontSize: "var(--text-base)",
  fontWeight: 500,
  lineHeight: 1,
  borderRadius: "var(--radius-md)",
  border: "1px solid transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

const VARIANT_STYLE: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "var(--color-primary)",
    color: "var(--color-primary-text)",
    borderColor: "var(--color-primary)",
  },
  secondary: {
    background: "var(--color-secondary-bg)",
    color: "var(--color-secondary-text)",
    borderColor: "var(--color-secondary-border)",
  },
};

const DISABLED_STYLE: CSSProperties = {
  opacity: 0.5,
  cursor: "not-allowed",
};

export function Button({
  variant = "primary",
  disabled = false,
  style,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      style={{
        ...BASE_STYLE,
        ...VARIANT_STYLE[variant],
        ...(disabled ? DISABLED_STYLE : {}),
        ...style,
      }}
      {...rest}
    />
  );
}
