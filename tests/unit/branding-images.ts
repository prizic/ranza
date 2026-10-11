/**
 * Images with real headers and nothing after them, for the suites that test a
 * logo (RANZ-47). Not a test file: it is imported by the unit, integration and
 * browser suites, which all need bytes that start the way a format says.
 *
 * The module reads a type from a signature and a size from a header, so a
 * header is all a fixture needs; `padTo` makes one the length a limit test
 * wants.
 */

function pad(bytes: number[], length?: number): Buffer {
  const out = Buffer.alloc(Math.max(length ?? 0, bytes.length));
  Buffer.from(bytes).copy(out);
  return out;
}

function big32(value: number): number[] {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ];
}

function big16(value: number): number[] {
  return [(value >>> 8) & 255, value & 255];
}

function little24(value: number): number[] {
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255];
}

const ascii = (text: string): number[] => [...Buffer.from(text, "ascii")];

export function png(width: number, height: number, padTo?: number): Buffer {
  return pad(
    [
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...big32(13),
      ...ascii("IHDR"),
      ...big32(width),
      ...big32(height),
      8,
      6,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ],
    padTo,
  );
}

export function jpeg(width: number, height: number, padTo?: number): Buffer {
  return pad(
    [
      0xff,
      0xd8,
      0xff,
      0xe0,
      0x00,
      0x10,
      ...ascii("JFIF"),
      0,
      1,
      1,
      0,
      0,
      1,
      0,
      1,
      0,
      0,
      0xff,
      0xc0,
      0x00,
      0x11,
      8,
      ...big16(height),
      ...big16(width),
      3,
      1,
      0x22,
      0,
      2,
      0x11,
      1,
      3,
      0x11,
      1,
    ],
    padTo,
  );
}

/** The extended format, which carries its canvas size as width - 1 and height - 1. */
export function webp(width: number, height: number, padTo?: number): Buffer {
  return pad(
    [
      ...ascii("RIFF"),
      ...[22, 0, 0, 0],
      ...ascii("WEBP"),
      ...ascii("VP8X"),
      ...[10, 0, 0, 0],
      0,
      0,
      0,
      0,
      ...little24(width - 1),
      ...little24(height - 1),
    ],
    padTo,
  );
}

/** The lossless format, which packs both sizes into four bytes. */
export function webpLossless(width: number, height: number): Buffer {
  const packed = ((height - 1) << 14) | (width - 1);
  return pad(
    [
      ...ascii("RIFF"),
      ...[22, 0, 0, 0],
      ...ascii("WEBP"),
      ...ascii("VP8L"),
      ...[10, 0, 0, 0],
      0x2f,
      packed & 255,
      (packed >>> 8) & 255,
      (packed >>> 16) & 255,
      (packed >>> 24) & 255,
    ],
    30,
  );
}

/** The lossy format: a frame tag, a start code, then two 14-bit sizes. */
export function webpLossy(width: number, height: number): Buffer {
  return pad([
    ...ascii("RIFF"),
    ...[22, 0, 0, 0],
    ...ascii("WEBP"),
    ...ascii("VP8 "),
    ...[10, 0, 0, 0],
    0,
    0,
    0,
    0x9d,
    0x01,
    0x2a,
    width & 255,
    (width >>> 8) & 63,
    height & 255,
    (height >>> 8) & 63,
  ]);
}

export function svg(): Buffer {
  return Buffer.from(
    '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><script>alert(1)</script></svg>',
  );
}
