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

export function SidebarProvider({
  children,
  defaultCollapsed = false,
  storageKey = SIDEBAR_STORAGE_KEY,
}: {
  children: ReactNode;
  defaultCollapsed?: boolean | undefined;
  storageKey?: string | undefined;
}) {
  const [collapsed, setCollapsedState] = useState(defaultCollapsed);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        setCollapsedState(stored === "true");
      }
    } catch {
      // LocalStorage may fail in restricted sandboxes; keep in-memory state
    }
  }, [storageKey]);

  const setCollapsed = (value: boolean) => {
    setCollapsedState(value);
    try {
      localStorage.setItem(storageKey, String(value));
    } catch {
      // Ignore write errors
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
