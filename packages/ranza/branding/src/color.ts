import { BrandingInputError } from "./errors";

/**
 * The smallest WCAG contrast ratio for body text (success criterion 1.4.3).
 */
export const MINIMUM_CONTRAST = 4.5;

/** The Portal's canvas, `--canvas` in packages/ui/src/styles/globals.css. */
const CANVAS_LUMINANCE = 1;
const WHITE = "#ffffff";
const BLACK = "#000000";

export type Foreground = typeof WHITE | typeof BLACK;

export type ColorAssessment =
  | {
      status: "ok";
      /** Lower-case `#rrggbb`. */
      color: string;
      /** White or black: whichever reads better on the colour. */
      foreground: Foreground;
      /** The colour against the white canvas, as links and the active item draw it. */
      contrast: number;
    }
  | { status: "invalid" }
  | { status: "unreadable"; color: string; contrast: number };

function channel(value: number): number {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a `#rrggbb` colour. */
function luminance(color: string): number {
  const [red, green, blue] = [1, 3, 5].map((start) =>
    channel(Number.parseInt(color.slice(start, start + 2), 16)),
  ) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function ratio(first: number, second: number): number {
  const [lighter, darker] = first >= second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Whether a colour can be a brand's, and what to draw on top of it.
 *
 * The foreground is derived, never chosen: whichever of white and black has
 * the greater contrast against the colour. Deriving it is not enough to refuse
 * anything — every colour reaches 4.58:1 against one of the two — so the
 * refusal is the other way a brand colour is used: as text on the canvas. A
 * colour under 4.5:1 against white is a link nobody can read (ADR 0046).
 */
export function assessBrandColor(input: string): ColorAssessment {
  const color = input.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) return { status: "invalid" };

  const own = luminance(color);
  const contrast = ratio(own, CANVAS_LUMINANCE);
  if (contrast < MINIMUM_CONTRAST) {
    return { status: "unreadable", color, contrast };
  }
  const foreground = contrast >= ratio(own, 0) ? WHITE : BLACK;
  return { status: "ok", color, foreground, contrast };
}

/** The colour a command may write, or the reason it may not. */
export function requireBrandColor(input: string): {
  color: string;
  foreground: Foreground;
} {
  const assessment = assessBrandColor(input);
  if (assessment.status === "invalid") {
    throw new BrandingInputError({ field: "color", reason: "invalid" });
  }
  if (assessment.status === "unreadable") {
    throw new BrandingInputError({
      field: "color",
      reason: "unreadable",
      contrast: assessment.contrast,
    });
  }
  return { color: assessment.color, foreground: assessment.foreground };
}
