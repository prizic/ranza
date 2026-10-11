import { BrandingInputError } from "./errors";

/**
 * The smallest WCAG contrast ratio for body text (success criterion 1.4.3).
 */
export const MINIMUM_CONTRAST = 4.5;

const WHITE = "#ffffff";
const BLACK = "#000000";

export type Foreground = typeof WHITE | typeof BLACK;

export type ColorAssessment =
  | {
      status: "ok";
      /** Lower-case `#rrggbb`: what buttons and filled surfaces are drawn in. */
      color: string;
      /** White or black: whichever reads better on the colour. */
      foreground: Foreground;
      /** The foreground against the colour. At least 4.5, for every colour. */
      foregroundContrast: number;
      /**
       * What text, links and outlines on the white canvas are drawn in: the
       * colour itself when that reads, and otherwise a darker shade of the
       * same hue that does.
       */
      textColor: string;
      /** The text colour against white. At least 4.5, for every colour. */
      textContrast: number;
    }
  | { status: "invalid" };

type Rgb = [red: number, green: number, blue: number];

function channel(value: number): number {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function encode(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear));
  return clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function parse(color: string): Rgb {
  return [1, 3, 5].map((start) =>
    Number.parseInt(color.slice(start, start + 2), 16),
  ) as Rgb;
}

function hex([red, green, blue]: Rgb): string {
  return `#${[red, green, blue]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** WCAG 2.x relative luminance of a `#rrggbb` colour. */
function luminance(color: string): number {
  const [red, green, blue] = parse(color).map(channel) as Rgb;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function ratio(first: number, second: number): number {
  const [lighter, darker] = first >= second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}

/** The colour's contrast against white. */
export function contrastWithWhite(color: string): number {
  return ratio(luminance(color), 1);
}

export interface Oklch {
  /** Lightness, 0 to 1. */
  lightness: number;
  chroma: number;
  /** Degrees, 0 to 360. Meaningless where chroma is nearly nothing. */
  hue: number;
}

/** A colour in OKLCH (Ottosson, 2020): lightness and chroma apart from hue. */
export function oklchOf(color: string): Oklch {
  const [red, green, blue] = parse(color).map(channel) as Rgb;
  const l = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue,
  );
  const m = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue,
  );
  const s = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue,
  );
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    lightness,
    chroma: Math.hypot(a, b),
    hue: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
  };
}

/** The linear sRGB of an OKLCH colour, unclamped, so a caller can tell if it fits. */
function linearOf({ lightness, chroma, hue }: Oklch): Rgb {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function fits(linear: Rgb): boolean {
  return linear.every((value) => value >= -0.0005 && value <= 1.0005);
}

/**
 * A colour at this lightness and hue, with as much of the chroma as the sRGB
 * gamut holds there. The hue is kept; the chroma is what gives way, which is
 * how a darker shade of an orange stays an orange and does not drift to red.
 */
function shade(lightness: number, chroma: number, hue: number): string {
  let low = 0;
  let high = chroma;
  let best: Rgb = linearOf({ lightness, chroma: 0, hue });
  if (fits(linearOf({ lightness, chroma, hue }))) {
    best = linearOf({ lightness, chroma, hue });
  } else {
    for (let step = 0; step < 24; step += 1) {
      const middle = (low + high) / 2;
      const candidate = linearOf({ lightness, chroma: middle, hue });
      if (fits(candidate)) {
        low = middle;
        best = candidate;
      } else {
        high = middle;
      }
    }
  }
  return hex(best.map((value) => Math.round(encode(value) * 255)) as Rgb);
}

/**
 * The colour to draw text and outlines in on the white canvas: the colour
 * itself when it reaches 4.5:1 against white, otherwise the same hue at the
 * greatest lightness that does. Searched in OKLCH, where lightness moves
 * without moving the hue.
 */
function textShade(color: string): string {
  if (contrastWithWhite(color) >= MINIMUM_CONTRAST) return color;

  const { lightness, chroma, hue } = oklchOf(color);
  let low = 0;
  let high = lightness;
  for (let step = 0; step < 30; step += 1) {
    const middle = (low + high) / 2;
    if (contrastWithWhite(shade(middle, chroma, hue)) >= MINIMUM_CONTRAST) {
      low = middle;
    } else {
      high = middle;
    }
  }
  // Rounding to eight bits can land a hair under; step down until it holds.
  let found = low;
  let candidate = shade(found, chroma, hue);
  while (contrastWithWhite(candidate) < MINIMUM_CONTRAST && found > 0) {
    found = Math.max(0, found - 0.002);
    candidate = shade(found, chroma, hue);
  }
  return candidate;
}

/**
 * What a brand colour is drawn as, or that it is not a colour.
 *
 * Every valid `#rrggbb` is accepted. Buttons and filled surfaces use it as it
 * is, with a foreground derived from it — white or black, whichever has the
 * greater contrast, and one of the two always reaches 4.5:1. Text, links and
 * outlines on the white canvas use a darker shade of the same hue where the
 * colour itself would not read there, which is most real brands: an orange is
 * a fine button and a poor link (ADR 0046).
 */
export function assessBrandColor(input: string): ColorAssessment {
  const color = input.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) return { status: "invalid" };

  const own = luminance(color);
  const againstWhite = ratio(own, 1);
  const againstBlack = ratio(own, 0);
  const foreground = againstWhite >= againstBlack ? WHITE : BLACK;
  const textColor = textShade(color);
  return {
    status: "ok",
    color,
    foreground,
    foregroundContrast: Math.max(againstWhite, againstBlack),
    textColor,
    textContrast: contrastWithWhite(textColor),
  };
}

/** The colour a command may write, or the reason it may not. */
export function requireBrandColor(input: string): {
  color: string;
  foreground: Foreground;
  textColor: string;
} {
  const assessment = assessBrandColor(input);
  if (assessment.status === "invalid") {
    throw new BrandingInputError({ field: "color", reason: "invalid" });
  }
  return {
    color: assessment.color,
    foreground: assessment.foreground,
    textColor: assessment.textColor,
  };
}
