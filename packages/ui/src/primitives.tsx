import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
} from "react";

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: "primary" | "secondary" | "quiet" | "danger";
}

export function Button({ className, tone = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={classes("button", `button-${tone}`, className)}
      {...props}
    />
  );
}

export interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  density?: "compact" | "comfortable";
  tone?: "default" | "strong" | "quiet";
}

export function Card({
  children,
  className,
  density = "comfortable",
  tone = "default",
  ...props
}: CardProps) {
  return (
    <section
      className={classes("card", `card-${density}`, `card-${tone}`, className)}
      {...props}
    >
      {children}
    </section>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={classes("input", className)}
      {...props}
    />
  );
}

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  label?: string;
}

export function Table({ className, label, ...props }: TableProps) {
  return (
    <div className="table-scroll">
      <table
        aria-label={label}
        className={classes("data-table", className)}
        {...props}
      />
    </div>
  );
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span className={classes("badge", `badge-${tone}`, className)} {...props} />
  );
}

export interface EmptyStateProps extends HTMLAttributes<HTMLElement> {
  action?: ReactNode;
  description: string;
  title: string;
}

export function EmptyState({
  action,
  className,
  description,
  title,
  ...props
}: EmptyStateProps) {
  return (
    <section className={classes("empty-state", className)} {...props}>
      <span aria-hidden="true" className="empty-state-mark" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </section>
  );
}
