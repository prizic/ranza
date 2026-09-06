import type { ReactNode } from "react";

export interface StatusMessageProps {
  children: ReactNode;
  tone?: "info" | "success" | "warning";
}

export function StatusMessage({ children, tone = "info" }: StatusMessageProps) {
  return (
    <p
      aria-live="polite"
      className={`status-message status-${tone}`}
      role="status"
    >
      {children}
    </p>
  );
}
