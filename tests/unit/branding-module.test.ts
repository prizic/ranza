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
  oklchOf,
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

  it("BR-S1-04: any valid colour is accepted and every colour has a text shade of at least 4.5:1 against white", () => {
    expect(assessBrandColor("#ffeb3b")).toMatchObject({
      status: "ok",
      color: "#ffeb3b",
    });
    expect(assessBrandColor("#ffffff")).toMatchObject({ status: "ok" });
    // A colour that already reads on white is its own text colour.
    expect(assessBrandColor("#0f5132")).toMatchObject({
      textColor: "#0f5132",
    });

    const steps = Array.from({ length: 17 }, (_, i) => i * 15);
    let darkened = 0;
    let kept = 0;
    for (const red of steps) {
      for (const green of steps) {
        for (const blue of steps) {
          const color = `#${[red, green, blue]
            .map((channel) => channel.toString(16).padStart(2, "0"))
            .join("")}`;
          const assessment = assessBrandColor(color);
          expect(assessment.status, color).toBe("ok");
          if (assessment.status !== "ok") continue;

          // Buttons: the colour as it is, and a foreground that reads on it.
          expect(assessment.color).toBe(color);
          const own = luminance(color);
          const foreground = assessment.foreground === "#ffffff" ? 1 : 0;
          expect(contrast(own, foreground), color).toBeGreaterThanOrEqual(
            MINIMUM_CONTRAST,
          );

          // Text and outlines: reads on white, checked here and not borrowed.
          expect(assessment.textColor, color).toMatch(/^#[0-9a-f]{6}$/);
          expect(
            contrast(luminance(assessment.textColor), 1),
            `${color} -> ${assessment.textColor}`,
          ).toBeGreaterThanOrEqual(MINIMUM_CONTRAST);
          expect(assessment.textContrast).toBeGreaterThanOrEqual(
            MINIMUM_CONTRAST,
          );

          if (contrast(own, 1) >= MINIMUM_CONTRAST) {
            kept += 1;
            expect(assessment.textColor, color).toBe(color);
          } else {
            darkened += 1;
            expect(oklchOf(assessment.textColor).lightness, color).toBeLessThan(
              oklchOf(color).lightness,
            );
          }
        }
      }
    }
    // A sweep that darkened nothing, or kept nothing, would prove nothing.
    expect(darkened).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });

  it("BR-S1-04: the text shade keeps the hue of the colour", () => {
    // OKLCH of pure red, which is published: L 0.628, C 0.258, h 29.2.
    expect(oklchOf("#ff0000")).toMatchObject({
      lightness: expect.closeTo(0.628, 2),
      chroma: expect.closeTo(0.258, 2),
      hue: expect.closeTo(29.2, 0),
    });

    const steps = Array.from({ length: 12 }, (_, i) => i * 23);
    let compared = 0;
    for (const red of steps) {
      for (const green of steps) {
        for (const blue of steps) {
          const color = `#${[red, green, blue]
            .map((channel) => channel.toString(16).padStart(2, "0"))
            .join("")}`;
          const assessment = assessBrandColor(color);
          if (assessment.status !== "ok") continue;
          const before = oklchOf(color);
          const after = oklchOf(assessment.textColor);
          // A grey has no hue to keep, and a colour near grey has one that a
          // single step of eight-bit rounding moves.
          if (before.chroma < 0.06 || after.chroma < 0.04) continue;
          compared += 1;
          const difference = Math.abs(before.hue - after.hue);
          expect(
            Math.min(difference, 360 - difference),
            `${color} -> ${assessment.textColor}`,
          ).toBeLessThan(4);
        }
      }
    }
    expect(compared).toBeGreaterThan(100);
  });

  it("BR-S1-04: an orange is a fine fill and its text shade is a darker orange", () => {
    const orange = assessBrandColor("#e67e22");
    expect(orange).toMatchObject({ status: "ok", color: "#e67e22" });
    if (orange.status !== "ok") return;
    expect(contrast(luminance("#e67e22"), 1)).toBeLessThan(MINIMUM_CONTRAST);
    expect(orange.textColor).not.toBe("#e67e22");
    const shade = oklchOf(orange.textColor);
    expect(shade.lightness).toBeLessThan(oklchOf("#e67e22").lightness);
    // Still orange: between red and yellow.
    expect(shade.hue).toBeGreaterThan(40);
    expect(shade.hue).toBeLessThan(75);
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

  it("BR-S1-42: a logo of 600 KB or 2 MB is refused as too large, before it is read", () => {
    for (const size of [600 * 1024, 2 * 1024 * 1024]) {
      expect(rejection(png(300, 200, size))).toEqual({
        field: "logo",
        reason: "too_large",
      });
    }
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

  const corrupt = { field: "logo", reason: "corrupt" } as const;

  it("BR-S1-11: a truncated image is corrupt", () => {
    // A PNG cut short at the signature, in a chunk, and before its end; a JPEG
    // that reaches its scan without a frame naming a size, and one with no end
    // marker; a WebP that is only its header.
    const whole = png(300, 200);
    for (const cut of [8, 20, whole.length - 12, whole.length - 1]) {
      expect(rejection(whole.subarray(0, cut)), `png at ${cut}`).toEqual(
        corrupt,
      );
    }
    expect(
      rejection(
        Buffer.from([
          0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xda, 0, 2,
        ]),
      ),
    ).toEqual(corrupt);
    const photo = jpeg(300, 200);
    expect(rejection(photo.subarray(0, photo.length - 2))).toEqual(corrupt);
    expect(rejection(Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBP"))).toEqual(
      corrupt,
    );
  });

  it("BR-S1-11: a PNG whose header checksum is wrong, or that has no IEND, or a tail after it, is corrupt", () => {
    const whole = Buffer.from(png(300, 200));
    // The IHDR checksum is the four bytes after its 13 data bytes.
    const badChecksum = Buffer.from(whole);
    badChecksum[8 + 8 + 13] = (badChecksum[8 + 8 + 13]! + 1) & 255;
    expect(rejection(badChecksum)).toEqual(corrupt);

    // Data changed under a checksum that was left as it was.
    const changed = Buffer.from(whole);
    changed[8 + 8 + 3] = (changed[8 + 8 + 3]! + 1) & 255;
    expect(rejection(changed)).toEqual(corrupt);

    // Whole chunks, no end.
    const endless = whole.subarray(0, whole.length - 12);
    expect(rejection(endless)).toEqual(corrupt);

    // Something appended after the end.
    expect(rejection(Buffer.concat([whole, Buffer.from("tail")]))).toEqual(
      corrupt,
    );
    expect(rejection(whole)).toBeNull();
  });

  it("BR-S1-11: a WebP whose RIFF length is not the file's, and a JPEG with a tail after its end, are corrupt", () => {
    const sound = Buffer.from(webp(300, 200));
    expect(rejection(sound)).toBeNull();
    expect(rejection(Buffer.concat([sound, Buffer.from("tail")]))).toEqual(
      corrupt,
    );
    expect(rejection(sound.subarray(0, sound.length - 2))).toEqual(corrupt);
    const lying = Buffer.from(sound);
    lying.writeUInt32LE(sound.length, 4);
    expect(rejection(lying)).toEqual(corrupt);

    const photo = jpeg(300, 200);
    expect(rejection(photo)).toBeNull();
    expect(rejection(Buffer.concat([photo, Buffer.from("tail")]))).toEqual(
      corrupt,
    );
    // No start-of-image marker is no JPEG at all.
    expect(rejection(Buffer.concat([Buffer.from([0, 0]), photo]))).toEqual({
      field: "logo",
      reason: "unsupported_type",
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
