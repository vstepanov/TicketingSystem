"use client";

/**
 * PasswordField (plan §5.2) — {@link TextField} pre-set to `type="password"`.
 *
 * Kept as a distinct component so screens read declaratively (§5.4/§5.5) and so a
 * show/hide toggle could be added here later without touching call sites.
 */
import { TextField, type TextFieldProps } from "./TextField";

export type PasswordFieldProps = Omit<TextFieldProps, "type">;

export function PasswordField(props: PasswordFieldProps) {
  return <TextField {...props} type="password" />;
}
