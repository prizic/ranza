import { createHash } from "node:crypto";
import { BrandingInputError } from "./errors";

export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_MIN_HEIGHT = 128;
export const LOGO_MAX_DIMENSION = 4096;

export type LogoContentType = "image/png" | "image/jpeg" | "image/webp";

export interface InspectedLogo {
  contentType: LogoContentType;
  sizeBytes: number;
  width: number;
  height: number;
  /** Hex SHA-256 of the bytes. */
  hash: string;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** A byte, or 0 past the end: every reader checks its length first. */
function byte(bytes: Uint8Array, at: number): number {
  return bytes[at] ?? 0;
}

function big16(bytes: Uint8Array, at: number): number {
  return (byte(bytes, at) << 8) | byte(bytes, at + 1);
}

function big32(bytes: Uint8Array, at: number): number {
  return big16(bytes, at) * 0x10000 + big16(bytes, at + 2);
}

function little16(bytes: Uint8Array, at: number): number {
  return byte(bytes, at) | (byte(bytes, at + 1) << 8);
}

function little24(bytes: Uint8Array, at: number): number {
  return little16(bytes, at) | (byte(bytes, at + 2) << 16);
}

function little32(bytes: Uint8Array, at: number): number {
  return little16(bytes, at) | (little16(bytes, at + 2) << 16);
}

interface Size {
  width: number;
  height: number;
}

/** The IHDR chunk is always first: length, "IHDR", then width and height. */
function pngSize(bytes: Uint8Array): Size | null {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") return null;
  return { width: big32(bytes, 16), height: big32(bytes, 20) };
}

/**
 * Start-of-frame markers carry the size. 0xC4, 0xC8 and 0xCC sit in the same
 * range and are not frames (Huffman tables, a reserved marker, arithmetic
 * conditioning).
 */
function isStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

function jpegSize(bytes: Uint8Array): Size | null {
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = byte(bytes, at + 1);
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // Standalone markers have no length: the temporary one and the restarts.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2;
      continue;
    }
    // The scan has begun without a frame ever naming a size.
    if (marker === 0xda || marker === 0xd9) return null;
    if (isStartOfFrame(marker)) {
      if (at + 9 > bytes.length) return null;
      return { height: big16(bytes, at + 5), width: big16(bytes, at + 7) };
    }
    at += 2 + big16(bytes, at + 2);
  }
  return null;
}

/** The first chunk after "WEBP" says which of three encodings the file is. */
function webpSize(bytes: Uint8Array): Size | null {
  if (bytes.length < 30) return null;
  const kind = ascii(bytes, 12, 4);
  if (kind === "VP8X") {
    return {
      width: little24(bytes, 24) + 1,
      height: little24(bytes, 27) + 1,
    };
  }
  if (kind === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    const packed = little32(bytes, 21);
    return {
      width: (packed & 0x3fff) + 1,
      height: ((packed >>> 14) & 0x3fff) + 1,
    };
  }
  if (kind === "VP8 ") {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      return null;
    }
    return {
      width: little16(bytes, 26) & 0x3fff,
      height: little16(bytes, 28) & 0x3fff,
    };
  }
  return null;
}

function typeOf(bytes: Uint8Array): LogoContentType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/**
 * SVG is XML, so it opens with `<svg` or a prolog; never with image bytes. The
 * decoder drops a leading byte-order mark, as a browser would.
 */
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 1024))
    .trimStart()
    .toLowerCase();
  return (
    head.startsWith("<svg") ||
    head.startsWith("<?xml") ||
    (head.startsWith("<!doctype svg") && head.includes("<svg"))
  );
}

/**
 * What the bytes are, read from the bytes.
 *
 * Not the file's name and not the type a browser sent, both of which are
 * whatever the sender chose to write: the signature decides the type and the
 * header decides the size. Throws `BrandingInputError` for anything a logo may
 * not be, and says which rule it broke.
 */
export function inspectLogo(bytes: Uint8Array): InspectedLogo {
  if (bytes.length === 0) {
    throw new BrandingInputError({ field: "logo", reason: "empty" });
  }
  if (bytes.length > LOGO_MAX_BYTES) {
    throw new BrandingInputError({ field: "logo", reason: "too_large" });
  }

  const contentType = typeOf(bytes);
  if (contentType === null) {
    throw new BrandingInputError({
      field: "logo",
      reason: looksLikeSvg(bytes) ? "svg" : "unsupported_type",
    });
  }

  const size =
    contentType === "image/png"
      ? pngSize(bytes)
      : contentType === "image/jpeg"
        ? jpegSize(bytes)
        : webpSize(bytes);
  if (size === null || size.width < 1 || size.height < 1) {
    throw new BrandingInputError({ field: "logo", reason: "corrupt" });
  }
  if (size.height < LOGO_MIN_HEIGHT) {
    throw new BrandingInputError({ field: "logo", reason: "too_small" });
  }
  if (size.width > LOGO_MAX_DIMENSION || size.height > LOGO_MAX_DIMENSION) {
    throw new BrandingInputError({
      field: "logo",
      reason: "dimensions_too_large",
    });
  }

  return {
    contentType,
    sizeBytes: bytes.length,
    width: size.width,
    height: size.height,
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
}
