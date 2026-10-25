/**
 * What is said about a logo the moment it is chosen (CONFIGURATION-01).
 *
 * The limits are the branding module's own, so the numbers asserted here are
 * the ones the server enforces: a file this check refuses is one the module
 * would have refused on save, and the other way round only for a header the
 * browser reads and the module does not.
 */
import { describe, expect, it } from "vitest";
import {
  LOGO_MAX_BYTES,
  LOGO_MAX_DIMENSION,
  LOGO_MIN_HEIGHT,
} from "../../packages/ranza/branding/src";
import {
  fileProblem,
  imageProblem,
} from "../../apps/operator-workspace/src/features/branding/logo-check";

const limits = {
  maxBytes: LOGO_MAX_BYTES,
  maxDimension: LOGO_MAX_DIMENSION,
  minHeight: LOGO_MIN_HEIGHT,
};

describe("a logo that was just chosen", () => {
  it("is refused when it is empty, too heavy, a vector or not an image, before it is decoded", () => {
    expect(fileProblem({ type: "image/png", size: 0 }, limits)).toBe("empty");
    expect(
      fileProblem({ type: "image/png", size: LOGO_MAX_BYTES + 1 }, limits),
    ).toBe("too_large");
    expect(fileProblem({ type: "image/svg+xml", size: 100 }, limits)).toBe(
      "svg",
    );
    expect(fileProblem({ type: "application/pdf", size: 100 }, limits)).toBe(
      "unsupported_type",
    );
    expect(
      fileProblem({ type: "image/png", size: LOGO_MAX_BYTES }, limits),
    ).toBeNull();
  });

  it("is refused when it is shorter than the module's minimum, at the pixel", () => {
    expect(
      imageProblem({ width: 300, height: LOGO_MIN_HEIGHT - 1 }, limits),
    ).toBe("too_small");
    expect(
      imageProblem({ width: 300, height: LOGO_MIN_HEIGHT }, limits),
    ).toBeNull();
  });

  it("is refused when either side passes the maximum, and one that cannot be decoded is corrupt", () => {
    expect(
      imageProblem(
        { width: LOGO_MAX_DIMENSION + 1, height: LOGO_MIN_HEIGHT },
        limits,
      ),
    ).toBe("dimensions_too_large");
    expect(
      imageProblem(
        { width: LOGO_MIN_HEIGHT, height: LOGO_MAX_DIMENSION + 1 },
        limits,
      ),
    ).toBe("dimensions_too_large");
    expect(imageProblem(null, limits)).toBe("corrupt");
  });
});
