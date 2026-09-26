"use client";

import type { ReactNode } from "react";
import { Direction } from "radix-ui";

/**
 * The direction every Radix primitive reads.
 *
 * `<html dir>` is not enough: Tabs, Select and the menus take their direction
 * from this context and default to left-to-right without it, and Tabs writes
 * `dir="ltr"` onto its own root — so an Arabic board inside tabs ran left to
 * right under a page that ran right to left.
 */
export function DirectionProvider({
  children,
  dir,
}: {
  children: ReactNode;
  dir: "ltr" | "rtl";
}) {
  return <Direction.Provider dir={dir}>{children}</Direction.Provider>;
}
