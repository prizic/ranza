import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export interface EmptyStateProps {
  action?: ReactNode;
  className?: string;
  description: string;
  title: string;
}

/**
 * An empty screen states what to do next, in the interface's own voice.
 *
 * Not a shadcn component, and deliberately not built on Card: an empty state is
 * the absence of content, so giving it a raised surface would make nothing look
 * like something.
 */
export function EmptyState({
  action,
  className,
  description,
  title,
}: EmptyStateProps) {
  return (
    <section
      className={cn(
        "max-w-prose border-s-2 border-line-strong ps-5 py-1.5",
        className,
      )}
    >
      <h2 className="text-step-1 font-normal">{title}</h2>
      <p className="mt-1.5 text-ink-soft">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}
