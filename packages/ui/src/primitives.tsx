import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

/**
 * The mark: a bunk seen from the side, two posts and two berths. "Ranza" is
 * Turkish for a bunk, so the product's name is drawn rather than illustrated.
 */
export function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M3 1.5v13M13 1.5v13M3 5.5h10M3 11h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ className, ...props }: ButtonProps) {
  return <button className={classes("button", className)} {...props} />;
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

export interface EmptyStateProps extends HTMLAttributes<HTMLElement> {
  action?: ReactNode;
  description: string;
  title: string;
}

/** An empty screen states what to do next, in the interface's own voice. */
export function EmptyState({
  action,
  className,
  description,
  title,
  ...props
}: EmptyStateProps) {
  return (
    <section className={classes("empty-state", className)} {...props}>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </section>
  );
}
