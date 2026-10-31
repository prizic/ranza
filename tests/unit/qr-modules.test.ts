/**
 * The QR code the desk shows a student is drawn here, from the link.
 *
 * No decoder is a dependency, so this cannot read a code back; the browser
 * spec reads the rendered one with the browser's own detector where it has one.
 * What it can prove is that the drawing is a function of the link alone, that a
 * longer link makes a larger code and not a broken one, and that the three
 * finder squares every scanner looks for are there.
 */
import { describe, expect, it } from "vitest";
import { qrDrawing } from "../../apps/operator-workspace/src/features/front-office/qr-modules";

const SHORT = "https://p.example/invite/" + "A".repeat(43);
const LONG =
  "https://portal.example.com/invite/" +
  "A".repeat(43) +
  "?x=" +
  "y".repeat(120);

/** The set of dark modules, from the path. */
function dark(path: string): Set<string> {
  return new Set(
    [...path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(
      (match) => `${match[1]},${match[2]}`,
    ),
  );
}

describe("a link drawn as a QR code", () => {
  it("is the same drawing for the same link and a different one for another", () => {
    expect(qrDrawing(SHORT)).toEqual(qrDrawing(SHORT));
    expect(qrDrawing(SHORT).path).not.toBe(
      qrDrawing(SHORT.replace("AAAA", "BBBB")).path,
    );
  });

  it("grows for a longer link instead of failing", () => {
    expect(qrDrawing(LONG).size).toBeGreaterThan(qrDrawing(SHORT).size);
  });

  it("keeps a four-module quiet zone and puts a finder square in three corners", () => {
    const { size, path } = qrDrawing(SHORT);
    const modules = dark(path);
    const near = 4;
    const far = size - 4 - 7;
    // Each finder is a 7x7 ring with a 3x3 centre; its corner module is dark.
    for (const [x, y] of [
      [near, near],
      [far, near],
      [near, far],
    ] as const) {
      expect(modules.has(`${x},${y}`)).toBe(true);
      expect(modules.has(`${x + 6},${y + 6}`)).toBe(true);
      expect(modules.has(`${x + 3},${y + 3}`)).toBe(true);
      expect(modules.has(`${x + 1},${y + 1}`)).toBe(false);
    }
    // Nothing is drawn in the margin.
    for (const module of modules) {
      const [x, y] = module.split(",").map(Number);
      expect(x).toBeGreaterThanOrEqual(4);
      expect(y).toBeGreaterThanOrEqual(4);
      expect(x).toBeLessThan(size - 4);
      expect(y).toBeLessThan(size - 4);
    }
  });
});
