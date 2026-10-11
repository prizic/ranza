import type { CSSProperties } from "react";
import { brandVariables } from "@ranza/ui";

/**
 * The theme tokens an Organization's brand sets, or nothing for the default
 * theme (ADR 0046). A colour without what is derived from it is not a brand
 * this can draw, and is treated as none.
 */
export function brandStyle(
  brand:
    | {
        primaryColor: string | null;
        primaryForeground: string | null;
        primaryText: string | null;
      }
    | undefined,
): CSSProperties | undefined {
  if (!brand?.primaryColor || !brand.primaryForeground || !brand.primaryText) {
    return undefined;
  }
  return brandVariables({
    color: brand.primaryColor,
    foreground: brand.primaryForeground,
    text: brand.primaryText,
  });
}
