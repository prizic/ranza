/**
 * The roles grid's sections (PEOPLE-06) and the words about the undo window.
 *
 * A permission missing from every section would vanish from the grid and from
 * the role editor with nothing to say so; one in two would be ticked twice.
 * The undo window is worded on the screen and decided by the module, so the two
 * are held together here the way the catalogue is held to the table.
 */
import { describe, expect, it } from "vitest";
import {
  PERMISSION_CATALOGUE,
  PERMISSION_SECTIONS,
  UNDO_WINDOW_HOURS,
} from "../../apps/operator-workspace/src/features/staff/labels";
import { UNDO_REVOKE_WINDOW_HOURS } from "../../packages/ranza/staff/src";

describe("the permission sections", () => {
  const listed = PERMISSION_SECTIONS.flatMap((section) => section.permissions);

  it("hold every permission in the catalogue", () => {
    expect([...listed].sort()).toEqual([...PERMISSION_CATALOGUE].sort());
  });

  it("hold each permission once", () => {
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("keep the money rows together, which is what the grid's filter is for", () => {
    const money = PERMISSION_SECTIONS.find(
      (section) => section.key === "money",
    );
    expect(money?.permissions.every((key) => key.startsWith("finance."))).toBe(
      true,
    );
    expect(
      PERMISSION_CATALOGUE.filter((key) => key.startsWith("finance.")).length,
    ).toBe(money?.permissions.length);
  });
});

describe("the undo window as the screen words it", () => {
  it("is the window the module enforces", () => {
    expect(UNDO_WINDOW_HOURS).toBe(UNDO_REVOKE_WINDOW_HOURS);
  });
});
