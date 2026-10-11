import type { CSSProperties } from "react";

/**
 * An Organization's brand, as the theme tokens it overrides (ADR 0046).
 *
 * The theme in `styles/globals.css` reads every primary button, link, active
 * navigation item and brand badge from `--primary` and `--primary-foreground`,
 * so setting the two on an element recolours everything beneath it and nothing
 * else: success, warning and destructive stay the system's colours. Set inline
 * on a root element from server data, which is why there is no stylesheet and
 * no class for it.
 *
 * `foreground` is white or black, derived from the colour by contrast where the
 * colour is validated; nothing here chooses it.
 */
export function brandVariables(brand: {
  color: string;
  foreground: string;
}): CSSProperties {
  return {
    "--primary": brand.color,
    "--primary-foreground": brand.foreground,
  } as CSSProperties;
}

/**
 * The theme's own primary, restated on an element inside a branded one — a
 * second Stay with an Organization that set no brand must not inherit the
 * first's. These are the values `:root` gives the two tokens.
 */
export const defaultBrandVariables = {
  "--primary": "var(--accent)",
  "--primary-foreground": "hsl(0 0% 100%)",
} as CSSProperties;
