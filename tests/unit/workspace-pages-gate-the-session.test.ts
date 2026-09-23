/**
 * Every Operator Workspace page checks the session itself.
 *
 * Moving between pages is a client navigation: Next renders the new page and
 * leaves the layout above it as it was, so the layout's `requireViewer` does
 * not run again. A page that only calls `currentViewer` or `entitledProperties`
 * answers an ended session (ADR 0027) with empty states under a shell still
 * showing somebody's email, instead of sending it to sign in. Nothing leaks —
 * the database denies either way — which is exactly why nobody would notice.
 *
 * A text scan, so a page that calls it in a shape this does not read would
 * fail here rather than pass unseen; that is the right way round to be wrong.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workspace = path.resolve(
  __dirname,
  "../../apps/operator-workspace/src/app/[locale]/(workspace)",
);

const GATE = /\bawait requireViewer\(locale\)/;

const pages = readdirSync(workspace, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(workspace, entry.name, "page.tsx"))
  .filter(existsSync);

describe("workspace pages", () => {
  it("are found at all", () => {
    // A scan that matched nothing would pass the next test for free.
    expect(pages.length).toBeGreaterThanOrEqual(15);
  });

  it("each send an ended session to sign in", () => {
    const ungated = pages
      .filter((file) => !GATE.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(workspace, file));
    expect(ungated).toEqual([]);
  });
});
