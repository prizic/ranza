/**
 * Why a branding command did not happen.
 *
 * Two classes and a reason on each, so the host can choose the words in the
 * reader's language (ADR 0023) and this module never has to write any. An
 * error that is neither is a defect or an outage, and the host reports it.
 */

export type ColorRejection =
  /** Not `#rrggbb`. */
  | "invalid"
  /**
   * Too light to be read as text on the Portal's white canvas, which is how
   * links and the active navigation item draw it (ADR 0046).
   */
  | "unreadable";

export type LogoRejection =
  | "empty"
  | "too_large"
  /** Refused by name: SVG can carry script (blueprint 8). */
  | "svg"
  /** Not PNG, JPEG or WebP, whatever the file was called. */
  | "unsupported_type"
  /** The signature is right and the header is not an image's. */
  | "corrupt"
  | "too_small"
  | "dimensions_too_large";

/** What the caller supplied that cannot be used. Raised before any statement runs. */
export type BrandingInputRejection =
  | { field: "color"; reason: ColorRejection; contrast?: number }
  | { field: "logo"; reason: LogoRejection };

export class BrandingInputError extends Error {
  constructor(readonly rejection: BrandingInputRejection) {
    super(`${rejection.field} cannot be used: ${rejection.reason}`);
    this.name = "BrandingInputError";
  }
}

/**
 * A policy or a grant said no, or the Organization is out of reach or does not
 * exist. One answer for all of them, because telling them apart would tell a
 * caller what exists where they cannot see.
 */
export class BrandingRefusedError extends Error {
  constructor(options?: ErrorOptions) {
    super("that branding change was refused", options);
    this.name = "BrandingRefusedError";
  }
}
