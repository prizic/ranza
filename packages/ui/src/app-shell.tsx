import type { ReactNode } from "react";

export interface AppShellProps {
  children: ReactNode;
  eyebrow: string;
  title: string;
}

export function AppShell({ children, eyebrow, title }: AppShellProps) {
  return (
    <main className="app-shell">
      <section className="app-card">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <div className="content">{children}</div>
      </section>
    </main>
  );
}
