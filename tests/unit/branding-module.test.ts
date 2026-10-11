/**
 * The parts of the branding module that need no database (RANZ-47).
 *
 * What the module does with a brand is in tests/integration/branding.test.ts
 * and what the tables admit is in tests/database/branding.test.sql; this holds
 * the colour arithmetic, the image inspection and the serving rules, which are
 * pure and which a regression in would not announce itself by failing a query.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assessBrandColor,
  BrandingInputError,
  LOGO_MAX_BYTES,
  MINIMUM_CONTRAST,
  serveLogo,
} from "../../packages/ranza/branding/src";
import { inspectLogo } from "../../packages/ranza/branding/src/image";
import {
  jpeg,
  png,
  svg,
  webp,
  webpLossless,
  webpLossy,
} from "./branding-images";

/** The contrast of two relative luminances, computed here and not borrowed. */
function contrast(first: number, second: number): number {
  const [light, dark] = first >= second ? [first, second] : [second, first];
  return (light + 0.05) / (dark + 0.05);
}

/** WCAG relative luminance of a #rrggbb colour, written out independently of the module. */
function luminance(color: string): number {
  const [red, green, blue] = [1, 3, 5].map((at) => {
    const unit = Number.parseInt(color.slice(at, at + 2), 16) / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function rejection(bytes: Uint8Array) {
  try {
    inspectLogo(bytes);
  } catch (error: unknown) {
    if (error instanceof BrandingInputError) return error.rejection;
    throw error;
  }
  return null;
}

describe("a brand colour", () => {
  it("BR-S1-02: only #rrggbb is a colour", () => {
    for (const input of [
      "red",
      "#fff",
      "#12345g",
      "rgb(1,2,3)",
      "#12345",
      "#1234567",
      "",
      "0f5132",
    ]) {
      expect(assessBrandColor(input).status, input).toBe("invalid");
    }
    // Stored lower-case, whatever was typed, and a stray space is not a refusal.
    expect(assessBrandColor("  #0F5132 ")).toMatchObject({
      status: "ok",
      color: "#0f5132",
    });
  });

  it("BR-S1-03: the foreground is whichever of white and black reads better", () => {
    expect(assessBrandColor("#0f5132")).toMatchObject({
      foreground: "#ffffff",
    });
    expect(assessBrandColor("#000000")).toMatchObject({
      foreground: "#ffffff",
    });
    // The sliver where a colour still passes as text on white and black reads
    // a little better on it than white does.
    expect(assessBrandColor("#767676")).toMatchObject({
      foreground: "#000000",
    });
  });

  it("BR-S1-04: a colour under 4.5:1 against white is unreadable and every colour reaches 4.5:1 against white or black", () => {
    expect(assessBrandColor("#ffeb3b")).toMatchObject({
      status: "unreadable",
      color: "#ffeb3b",
    });
    expect(assessBrandColor("#ffffff")).toMatchObject({
      status: "unreadable",
      contrast: 1,
    });

    // The finding the row records: the foreground rule alone refuses nothing,
    // because no colour is out of reach of both white and black. Every one the
    // module refuses would have had a foreground; the refusal is the colour
    // itself as text on the page.
    const steps = Array.from({ length: 17 }, (_, i) => i * 15);
    let refused = 0;
    let accepted = 0;
    for (const red of steps) {
      for (const green of steps) {
        for (const blue of steps) {
          const color = `#${[red, green, blue]
            .map((channel) => channel.toString(16).padStart(2, "0"))
            .join("")}`;
          const own = luminance(color);
          expect(
            Math.max(contrast(own, 1), contrast(own, 0)),
            color,
          ).toBeGreaterThanOrEqual(MINIMUM_CONTRAST);

          const assessment = assessBrandColor(color);
          if (assessment.status === "unreadable") {
            refused += 1;
            expect(contrast(own, 1), color).toBeLessThan(MINIMUM_CONTRAST);
          } else {
            accepted += 1;
            expect(assessment.status, color).toBe("ok");
            if (assessment.status === "ok") {
              const foreground = assessment.foreground === "#ffffff" ? 1 : 0;
              expect(contrast(own, foreground), color).toBeGreaterThanOrEqual(
                MINIMUM_CONTRAST,
              );
            }
          }
        }
      }
    }
    // A sweep that refused everything, or nothing, would prove nothing.
    expect(refused).toBeGreaterThan(0);
    expect(accepted).toBeGreaterThan(0);
  });
});

describe("a logo", () => {
  it("BR-S1-05: a PNG a JPEG and a WebP are read for their type and size from their bytes", () => {
    const cases = [
      { bytes: png(300, 200), type: "image/png", width: 300, height: 200 },
      { bytes: jpeg(640, 480), type: "image/jpeg", width: 640, height: 480 },
      { bytes: webp(512, 256), type: "image/webp", width: 512, height: 256 },
      {
        bytes: webpLossless(400, 130),
        type: "image/webp",
        width: 400,
        height: 130,
      },
      {
        bytes: webpLossy(333, 144),
        type: "image/webp",
        width: 333,
        height: 144,
      },
    ];
    for (const { bytes, type, width, height } of cases) {
      expect(inspectLogo(bytes), type).toEqual({
        contentType: type,
        sizeBytes: bytes.length,
        width,
        height,
        hash: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  });

  it("BR-S1-06: an SVG is refused by name whatever it is called", () => {
    expect(rejection(svg())).toEqual({ field: "logo", reason: "svg" });
    // A byte-order mark, an uppercase tag, no prolog: still SVG.
    expect(
      rejection(Buffer.from("﻿  <SVG xmlns='http://www.w3.org/2000/svg'/>")),
    ).toEqual({ field: "logo", reason: "svg" });
  });

  it("BR-S1-07: a logo over 512 KB is refused and one of exactly 512 KB is not", () => {
    expect(rejection(png(300, 200, LOGO_MAX_BYTES + 1))).toEqual({
      field: "logo",
      reason: "too_large",
    });
    expect(rejection(png(300, 200, LOGO_MAX_BYTES))).toBeNull();
  });

  it("BR-S1-08: a logo under 128 px tall or over 4096 px is refused", () => {
    expect(rejection(png(300, 127))).toEqual({
      field: "logo",
      reason: "too_small",
    });
    expect(rejection(png(300, 128))).toBeNull();
    expect(rejection(png(4097, 200))).toEqual({
      field: "logo",
      reason: "dimensions_too_large",
    });
    expect(rejection(png(300, 4097))).toEqual({
      field: "logo",
      reason: "dimensions_too_large",
    });
    expect(rejection(png(4096, 4096))).toBeNull();
    expect(rejection(jpeg(300, 100))).toEqual({
      field: "logo",
      reason: "too_small",
    });
    expect(rejection(webp(300, 100))).toEqual({
      field: "logo",
      reason: "too_small",
    });
  });

  it("BR-S1-09: a text file named logo.png is not a logo", () => {
    // There is no file name to consult: the module is handed bytes, which is
    // the point. A plain text file, a PDF and a GIF are each refused for what
    // they start with.
    for (const bytes of [
      Buffer.from("this is not a picture"),
      Buffer.from("%PDF-1.7 not a picture either"),
      Buffer.from("GIF89a\u0001\u0000\u0001\u0000"),
    ]) {
      expect(rejection(bytes)).toEqual({
        field: "logo",
        reason: "unsupported_type",
      });
    }
    expect(rejection(Buffer.alloc(0))).toEqual({
      field: "logo",
      reason: "empty",
    });
  });

  it("BR-S1-11: a truncated image is corrupt", () => {
    expect(rejection(Buffer.from(png(300, 200).subarray(0, 8)))).toEqual({
      field: "logo",
      reason: "corrupt",
    });
    // A JPEG that reaches its scan without a frame ever naming a size.
    expect(
      rejection(
        Buffer.from([
          0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xda, 0, 2,
        ]),
      ),
    ).toEqual({ field: "logo", reason: "corrupt" });
    expect(rejection(Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBP"))).toEqual({
      field: "logo",
      reason: "corrupt",
    });
  });
});

describe("serving a logo", () => {
  const bytes = Buffer.from(png(300, 200));
  const hash = createHash("sha256").update(bytes).digest("hex");
  const logo = { bytes, contentType: "image/png" as const, hash };

  it("BR-S1-28: a request naming the current hash is cached for good and any other revalidates", () => {
    const named = serveLogo(logo, { version: hash, ifNoneMatch: null });
    expect(named.status).toBe(200);
    expect(named.headers["Cache-Control"]).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(named.headers["Content-Type"]).toBe("image/png");
    expect(named.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(Buffer.from(named.body!).equals(bytes)).toBe(true);

    for (const version of [null, "an-older-hash"]) {
      expect(
        serveLogo(logo, { version, ifNoneMatch: null }).headers[
          "Cache-Control"
        ],
      ).toBe("private, no-cache");
    }
  });

  it("BR-S1-28: a matching ETag is a 304 with no body", () => {
    const answer = serveLogo(logo, {
      version: null,
      ifNoneMatch: `"${hash}"`,
    });
    expect(answer.status).toBe(304);
    expect(answer.body).toBeUndefined();
    expect(answer.headers.ETag).toBe(`"${hash}"`);

    expect(
      serveLogo(logo, { version: null, ifNoneMatch: '"another"' }).status,
    ).toBe(200);
  });
});
