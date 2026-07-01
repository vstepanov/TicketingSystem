/**
 * Shared UI component barrel (plan §5.2).
 *
 * Re-exports the app-shell components + Button added in S14 and the auth form
 * primitives added in S15. Later steps add the remaining inventory (Select,
 * Dialog, Badge, …).
 */
export { Button } from "./Button";
export type { ButtonProps, ButtonVariant } from "./Button";
export { Header } from "./Header";
export { NavTabs } from "./NavTabs";
export { UserMenu } from "./UserMenu";
export { AppShell } from "./AppShell";
export { Providers } from "./Providers";
export { TextField } from "./TextField";
export type { TextFieldProps } from "./TextField";
export { Select } from "./Select";
export type { SelectProps } from "./Select";
export { Textarea } from "./Textarea";
export type { TextareaProps } from "./Textarea";
export { PasswordField } from "./PasswordField";
export type { PasswordFieldProps } from "./PasswordField";
export { FieldError } from "./FieldError";
export type { FieldErrorProps } from "./FieldError";
export { AuthCard } from "./AuthCard";
export type { AuthCardProps } from "./AuthCard";
export { Spinner } from "./Spinner";
export type { SpinnerProps } from "./Spinner";
export { Table, THead, TBody, Tr, Th, Td } from "./Table";
export type { ThProps, TdProps } from "./Table";
export { Pill } from "./Pill";
export type { PillProps, PillTone } from "./Pill";
export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";
export { Dialog, ConfirmDialog } from "./Dialog";
export type { DialogProps, ConfirmDialogProps } from "./Dialog";
export { ToastProvider, useToast } from "./Toast";
export type { ToastApi, ToastTone } from "./Toast";
export { BoardScreen } from "./board/BoardScreen";
export { BoardColumn } from "./board/BoardColumn";
export { TicketCard } from "./board/TicketCard";
export { FilterBar } from "./board/FilterBar";
export { CreateTicketScreen } from "./tickets/CreateTicketScreen";
export { TicketDetailScreen } from "./tickets/TicketDetailScreen";
export { TicketForm } from "./tickets/TicketForm";
export type { TicketFormValues, TicketFormErrors } from "./tickets/TicketForm";
export { CommentsPanel } from "./tickets/CommentsPanel";
