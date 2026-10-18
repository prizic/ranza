"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface OverlayLabels {
  /** The name of the control that closes a dialog or a side sheet. */
  close: string;
}

/**
 * What a tree with no provider says: English, which is wrong on any other
 * page. Every route of the Workspace sits under the provider in its root
 * layout, so this is for a component rendered alone — a test, a sandbox.
 */
const WITHOUT_PROVIDER: OverlayLabels = { close: "Close" };

const OverlayLabelsContext = createContext<OverlayLabels>(WITHOUT_PROVIDER);

/**
 * The words a dialog or a sheet carries of its own, supplied once by the host.
 *
 * They cannot be a prop on every `DialogContent`: there are dozens, and the one
 * the close control sits in is the one a screen never writes. A fixed English
 * word was English on an Arabic page, which is what a screen reader announced
 * on every dialog until this existed.
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
  return useContext(OverlayLabelsContext);
}
