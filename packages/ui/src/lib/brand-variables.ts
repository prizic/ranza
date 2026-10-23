import type { CSSProperties } from "react";

/**
 * An Organization's brand, as the theme tokens it overrides (ADR 0046).
 *
 * The theme in `styles/globals.css` draws every primary button, active
 * navigation item and brand badge from `--primary` and `--primary-foreground`,
 * and every link and every outline on the white canvas from `--primary-text`
 * and `--ring`. A brand colour is a fine fill and often a poor text colour, so
 * the two are told apart: `color` fills, and `text` is the shade of it that
 * reads on white. Set inline on a root element from server data, which is why
 * there is no stylesheet and no class for it; success, warning and destructive
 * colours are other tokens and do not move.
 *
 * `foreground` and `text` are derived from the colour where it is validated;
 * nothing here chooses them.
 */
export function brandVariables(brand: {
  color: string;
  foreground: string;
  text: string;
}): CSSProperties {
  return {
    "--primary": brand.color,
    "--primary-foreground": brand.foreground,
    "--primary-text": brand.text,
    "--ring": brand.text,
  } as CSSProperties;
}

/**
 * The theme's own tokens, restated on an element inside a branded one — a
 * second Stay with an Organization that set no brand must not inherit the
 * first's. These are the values `:root` gives them.
 */
export const defaultBrandVariables = {
  "--primary": "var(--accent)",
  "--primary-foreground": "hsl(0 0% 100%)",
  "--primary-text": "var(--accent)",
  "--ring": "var(--focus)",
} as CSSProperties;
