"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface OverlayLabels {
  /** The name of the control that closes a dialog or a side sheet. */
  close: string;
}

const OverlayLabelsContext = createContext<OverlayLabels | null>(null);

/**
 * The words a dialog or a sheet carries of its own, supplied once by the host.
 *
 * They cannot be a prop on every `DialogContent`: there are dozens, and the one
 * the close control sits in is the one a screen never writes. They cannot be
 * defaulted either — an English fallback is English on an Arabic page, which is
 * what a screen reader announced on every dialog until this existed.
 */
export function OverlayLabelsProvider({
  children,
  labels,
}: {
  children: ReactNode;
  labels: OverlayLabels;
}) {
  return (
    <OverlayLabelsContext.Provider value={labels}>
      {children}
    </OverlayLabelsContext.Provider>
  );
}

export function useOverlayLabels(): OverlayLabels {
  const labels = useContext(OverlayLabelsContext);
  if (!labels) {
    throw new Error(
      "A dialog or sheet was rendered outside an OverlayLabelsProvider.",
    );
  }
  return labels;
}
