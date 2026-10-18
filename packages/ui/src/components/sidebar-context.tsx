"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
  inSidebar: boolean;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export const SIDEBAR_STORAGE_KEY = "ranza-sidebar-collapsed";

/**
 * The window width, in px, under which the sidebar starts folded to icons for
 * somebody who has never chosen. Open, it takes 240 px or more: about 40% of a
 * tablet, which pushed the day's main action off the right edge of every table.
 */
export const SIDEBAR_COLLAPSE_BELOW = 1280;

function storedChoice(storageKey: string): boolean | null {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === null ? null : stored === "true";
  } catch (error) {
    console.warn("sidebar.choice_unreadable", error);
    return null;
  }
}

export function SidebarProvider({
  children,
  collapseBelow = SIDEBAR_COLLAPSE_BELOW,
  defaultCollapsed = false,
  storageKey = SIDEBAR_STORAGE_KEY,
}: {
  children: ReactNode;
  /**
   * Folds the sidebar to icons under this width while nobody has chosen; the
   * person's own choice, once made, wins at every width.
   */
  collapseBelow?: number | undefined;
  defaultCollapsed?: boolean | undefined;
  storageKey?: string | undefined;
}) {
  const [collapsed, setCollapsedState] = useState(defaultCollapsed);

  useEffect(() => {
    // Not every environment can say how wide the window is; a test renders
    // the sidebar as the person left it, or open.
    const narrow =
      typeof window.matchMedia === "function"
        ? window.matchMedia(`(max-width: ${collapseBelow - 1}px)`)
        : null;
    // The person's own choice wins at every width. Without one, the width
    // decides, and turning a tablet to landscape opens the sidebar again.
    const settle = () =>
      setCollapsedState(
        storedChoice(storageKey) ??
          (narrow?.matches === true || defaultCollapsed),
      );
    settle();
    narrow?.addEventListener("change", settle);
    return () => narrow?.removeEventListener("change", settle);
  }, [collapseBelow, defaultCollapsed, storageKey]);

  const setCollapsed = (value: boolean) => {
    setCollapsedState(value);
    try {
      localStorage.setItem(storageKey, String(value));
    } catch (error) {
      console.warn("sidebar.choice_not_saved", error);
    }
  };

  const toggle = () => setCollapsed(!collapsed);

  return (
    <SidebarContext.Provider
      value={{ collapsed, setCollapsed, toggle, inSidebar: true }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  return (
    context ?? {
      collapsed: false,
      setCollapsed: () => {},
      toggle: () => {},
      inSidebar: false,
    }
  );
}
