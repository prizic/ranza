/**
 * Where a second factor is set up (OA-S2-15, ADR 0010).
 *
 * Only the Workspace offers it, at /{locale}/security, and it is reached from
 * the account menu rather than the rail: the rail lists what the Organization
 * bought (blueprint 4.6), and a second factor belongs to the person, not to a
 * package. A Guest or Resident has no account settings surface, so the Portal
 * has no such page.
 *
 * The account menu is built in the server layout, which this reads as text —
 * comments removed first, so a comment naming the link does not stand in for
 * it.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_SCREENS } from "../../apps/operator-workspace/src/lib/screens";

const WORKSPACE = path.join(
  import.meta.dirname,
  "../../apps/operator-workspace/src/app/[locale]/(workspace)",
);
const PORTAL = path.join(
  import.meta.dirname,
  "../../apps/guest-portal/src/app",
);
const COMMENTS = /\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/.*$/gm;

function routeDirectories(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

describe("security", () => {
  it("security is reached from the account menu", () => {
    const layout = readFileSync(
      path.join(WORKSPACE, "layout.tsx"),
      "utf8",
    ).replace(COMMENTS, "");
    const accountItems = layout.match(
      /const accountItems = \(([\s\S]*?)\n {2}\);/,
    )?.[1];

    expect(
      accountItems,
      "the layout builds no account menu items",
    ).toBeDefined();
    expect(accountItems).toContain('localizeHref(locale, "security")');
    expect(existsSync(path.join(WORKSPACE, "security", "page.tsx"))).toBe(true);
  });

  it("and is not a rail destination", () => {
    expect(ALL_SCREENS.map((screen) => screen.segment)).not.toContain(
      "security",
    );
  });

  it("and the Portal has no such page", () => {
    expect(routeDirectories(PORTAL)).not.toContain("security");
  });
});
