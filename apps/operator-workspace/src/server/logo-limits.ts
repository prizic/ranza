import {
  LOGO_MAX_BYTES,
  LOGO_MAX_DIMENSION,
  LOGO_MIN_HEIGHT,
} from "@ranza/branding";

/**
 * What the branding module accepts of a logo, handed to the screen that asks
 * for one so it quotes the numbers the server enforces and cannot drift from
 * them. Constants only: nothing here reads a tenant, so the page may import it
 * without going through the viewer funnel.
 */
export const LOGO_LIMITS = {
  maxBytes: LOGO_MAX_BYTES,
  maxDimension: LOGO_MAX_DIMENSION,
  minHeight: LOGO_MIN_HEIGHT,
} as const;
