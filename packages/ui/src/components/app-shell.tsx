import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "./ui/sidebar";

export interface AppShellProps {
  /** The signed-in Staff Member, rendered at the end of the top bar. */
  account?: ReactNode;
  children: ReactNode;
  /** Shown under the wordmark: the Organization, and the Property switcher. */
  scope?: ReactNode;
  /** The navigation tree. A client component, because current depends on route. */
  navigation: ReactNode;
  /** Business date, language, notifications — whatever the host puts there. */
  toolbar?: ReactNode;
  productName: string;
  /** Localized, because this is the first thing a keyboard user hears. */
  skipLabel: string;
  /**
   * Which edge the sidebar sits on. Arabic reads right to left, so the host
   * passes "right" for it — the shadcn sidebar mirrors its own rail, trigger
   * and offcanvas transition from this, which no amount of logical CSS would
   * have done on its own.
   */
  side?: "left" | "right";
  /** Localized label for the collapse control. */
  toggleLabel: string;
}

/**
 * The authenticated chrome: a dark rail, a thin top bar, and the work surface.
 *
 * The rail is `--sidebar`, its own surface, so how dark it is is a token rather
 * than a rewrite — see docs/design/visual-reference.md, which asks for a dark
 * one, and the approved mockups, which mostly draw it light.
 *
 * The page below owns its own heading. A router layout cannot know what the
 * page is called, and inventing a title here would put the wrong `h1` on every
 * route.
 */
export function AppShell({
  account,
  children,
  navigation,
  productName,
  scope,
  side = "left",
  skipLabel,
  toggleLabel,
  toolbar,
}: AppShellProps) {
  return (
    <SidebarProvider>
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-md focus:bg-sidebar focus:px-4 focus:py-2 focus:text-sidebar-foreground"
        href="#main-content"
      >
        {skipLabel}
      </a>

      <Sidebar collapsible="icon" side={side}>
        <SidebarHeader className="gap-3 p-4">
          <p className="flex items-center gap-2 text-step-1 font-semibold">
            <BrandMark className="shrink-0 text-sidebar-primary" />
            <span className="truncate group-data-[collapsible=icon]:hidden">
              {productName}
            </span>
          </p>
          {scope ? (
            <div className="group-data-[collapsible=icon]:hidden">{scope}</div>
          ) : null}
        </SidebarHeader>

        <SidebarContent>{navigation}</SidebarContent>

        <SidebarFooter className="p-4 text-step--1 text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
          {productName}
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-(--page)">
          <SidebarTrigger aria-label={toggleLabel} className="-ms-2" />
          {toolbar}
          {account ? <div className="ms-auto">{account}</div> : null}
        </header>

        <main
          className="flex-1 px-(--page) py-7 focus:outline-none"
          id="main-content"
          tabIndex={-1}
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
