import { crc32 } from "node:zlib";

/**
 * Images whose structure is whole and whose pixels are nothing, for the suites
 * that test a logo (RANZ-47). Not a test file: it is imported by the unit,
 * integration and browser suites, which all need bytes a format would call a
 * file.
 *
 * The module reads a type from a signature, a size from a header, and checks
 * that the file is not cut short or added to, so a fixture has its header, its
 * end and the checksums or lengths between them. Nothing here decodes, so the
 * image data is a few bytes; `padTo` brings a file to an exact length, which is
 * how a limit test gets one of 512 KB and a byte.
 */

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

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  return Buffer.concat([
    Buffer.from(big32(data.length)),
    body,
    Buffer.from(big32(crc32(body))),
  ]);
}

/** A PNG whose chunks are whole: a header, a data chunk, and the end. */
export function png(width: number, height: number, padTo?: number): Buffer {
  const header = Buffer.concat([
    Buffer.from(big32(width)),
    Buffer.from(big32(height)),
    Buffer.from([8, 6, 0, 0, 0]),
  ]);
  const chunks = [
    pngChunk("IHDR", header),
    pngChunk("IDAT", Buffer.from([0x78, 0x9c, 0x03, 0, 0, 0, 0, 1])),
  ];
  const end = pngChunk("IEND", Buffer.alloc(0));
  const base =
    PNG_SIGNATURE.length +
    chunks.reduce((sum, chunk) => sum + chunk.length, 0) +
    end.length;
  if (padTo !== undefined && padTo > base + 12) {
    chunks.push(pngChunk("tEXt", Buffer.alloc(padTo - base - 12, 0x61)));
  }
  return Buffer.concat([Buffer.from(PNG_SIGNATURE), ...chunks, end]);
}

/** A JPEG with its start, a frame that names its size, and its end. */
export function jpeg(width: number, height: number, padTo?: number): Buffer {
  const head = Buffer.from([
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
  ]);
  const end = Buffer.from([0xff, 0xd9]);
  const comments: Buffer[] = [];
  let remaining = padTo === undefined ? 0 : padTo - head.length - end.length;
  while (remaining >= 4) {
    let segment = Math.min(remaining, 65537);
    if (remaining - segment > 0 && remaining - segment < 4) segment -= 4;
    comments.push(
      Buffer.concat([
        Buffer.from([0xff, 0xfe, ...big16(segment - 2)]),
        Buffer.alloc(segment - 4, 0x61),
      ]),
    );
    remaining -= segment;
  }
  return Buffer.concat([head, ...comments, end]);
}

/** A WebP file: the RIFF header, whose length is the file's, and its chunks. */
function riff(chunks: Buffer, padTo?: number): Buffer {
  const room = padTo === undefined ? 0 : padTo - 12 - chunks.length - 8;
  const filler =
    room > 0
      ? Buffer.concat([
          Buffer.from(ascii("JUNK")),
          Buffer.from([...little24(room), 0]),
          Buffer.alloc(room),
        ])
      : Buffer.alloc(0);
  const body = Buffer.concat([Buffer.from(ascii("WEBP")), chunks, filler]);
  return Buffer.concat([
    Buffer.from(ascii("RIFF")),
    Buffer.from([...little24(body.length), 0]),
    body,
  ]);
}

/** The extended format, which carries its canvas size as width - 1 and height - 1. */
export function webp(width: number, height: number, padTo?: number): Buffer {
  return riff(
    Buffer.from([
      ...ascii("VP8X"),
      ...[10, 0, 0, 0],
      ...[0, 0, 0, 0],
      ...little24(width - 1),
      ...little24(height - 1),
    ]),
    padTo,
  );
}

/** The lossless format, which packs both sizes into four bytes. */
export function webpLossless(width: number, height: number): Buffer {
  const packed = ((height - 1) << 14) | (width - 1);
  return riff(
    Buffer.from([
      ...ascii("VP8L"),
      ...[10, 0, 0, 0],
      0x2f,
      packed & 255,
      (packed >>> 8) & 255,
      (packed >>> 16) & 255,
      (packed >>> 24) & 255,
      ...[0, 0, 0, 0, 0],
    ]),
  );
}

/** The lossy format: a frame tag, a start code, then two 14-bit sizes. */
export function webpLossy(width: number, height: number): Buffer {
  return riff(
    Buffer.from([
      ...ascii("VP8 "),
      ...[10, 0, 0, 0],
      ...[0, 0, 0],
      0x9d,
      0x01,
      0x2a,
      width & 255,
      (width >>> 8) & 63,
      height & 255,
      (height >>> 8) & 63,
    ]),
  );
}

export function svg(): Buffer {
  return Buffer.from(
    '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><script>alert(1)</script></svg>',
  );
}
