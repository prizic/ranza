/**
 * What the Housekeeping screen's form fields become (RANZ-28).
 *
 * The integration suite proves the commands and the policies. This proves the
 * translation in front of them, which nothing else runs: "default" is a null
 * override, "on" is true, a scope or value outside the lists is invalid rather
 * than a command, and a field that must be an id and is not is caught here
 * instead of surfacing as a Postgres cast error. A typo in any of those
 * literals would otherwise ship green.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const setPropertyInspection = vi.fn();
const setOrganizationInspection = vi.fn();
const markUnits = vi.fn();
const revalidatePath = vi.fn();

// The application resolves its own copy of next, so the mock names that copy.
vi.mock("../../apps/operator-workspace/node_modules/next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  currentViewer: async () => ({ userId: VIEWER }),
}));
vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({
    housekeeping: {
      setPropertyInspection,
      setOrganizationInspection,
      markUnits,
    },
  }),
}));

const VIEWER = "dd000001-0000-4000-8000-000000000001";
const PROPERTY = "dd000003-0000-4000-8000-000000000001";
const ROOM = "dd000004-0000-4000-8000-000000000001";

const { markRooms, setInspection } =
  await import("../../apps/operator-workspace/src/server/housekeeping");
const { HousekeepingRefusedError } =
  await import("../../packages/ranza/housekeeping/src");

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      data.append(key, item);
    }
  }
  return data;
}

const idle = { status: "idle" } as const;

beforeEach(() => {
  setPropertyInspection.mockReset().mockResolvedValue(undefined);
  setOrganizationInspection.mockReset().mockResolvedValue(undefined);
  markUnits.mockReset().mockResolvedValue({ marked: 1 });
  revalidatePath.mockReset();
});

describe("the inspection setting's form", () => {
  it.each([
    ["on", true],
    ["off", false],
    ["default", null],
  ] as const)("a Property's %s becomes %s", async (value, expected) => {
    const outcome = await setInspection(
      idle,
      form({ locale: "en", propertyId: PROPERTY, scope: "property", value }),
    );
    expect(outcome).toEqual({ status: "done" });
    expect(setPropertyInspection).toHaveBeenCalledWith(
      VIEWER,
      PROPERTY,
      expected,
    );
  });

  it("an Organization's on and off become the default", async () => {
    await setInspection(
      idle,
      form({
        locale: "en",
        propertyId: PROPERTY,
        scope: "organization",
        value: "on",
      }),
    );
    expect(setOrganizationInspection).toHaveBeenCalledWith(
      VIEWER,
      PROPERTY,
      true,
    );
  });

  it("the Organization has no 'use the default' of its own", async () => {
    const outcome = await setInspection(
      idle,
      form({
        locale: "en",
        propertyId: PROPERTY,
        scope: "organization",
        value: "default",
      }),
    );
    expect(outcome).toEqual({ status: "invalid" });
    expect(setOrganizationInspection).not.toHaveBeenCalled();
  });

  it("an unknown scope or a malformed Property is invalid, not a command", async () => {
    for (const fields of [
      { locale: "en", propertyId: PROPERTY, scope: "unit", value: "on" },
      { locale: "en", propertyId: "not-an-id", scope: "property", value: "on" },
    ]) {
      expect(await setInspection(idle, form(fields))).toEqual({
        status: "invalid",
      });
    }
    expect(setPropertyInspection).not.toHaveBeenCalled();
  });
});

describe("the mark's form", () => {
  it("passes every selected room and the status through", async () => {
    await markRooms(
      idle,
      form({ locale: "en", status: "clean", unitId: [ROOM, ROOM] }),
    );
    expect(markUnits).toHaveBeenCalledWith(VIEWER, {
      unitIds: [ROOM, ROOM],
      status: "clean",
    });
  });

  // HK-S2-13: what follows a refusal is the board the page reads next, so the
  // refusal has to make it read again — the board a refused viewer is left
  // looking at is otherwise the one that still offers them the controls.
  it("answers a refused mark as refused and reads the board again (HK-S2-13)", async () => {
    markUnits.mockRejectedValue(new HousekeepingRefusedError());
    expect(
      await markRooms(
        idle,
        form({ locale: "en", status: "clean", unitId: ROOM }),
      ),
    ).toEqual({ status: "refused" });
    expect(revalidatePath).toHaveBeenCalledWith("/en/housekeeping");
  });

  it("refuses a malformed room id before it reaches the module", async () => {
    expect(
      await markRooms(
        idle,
        form({ locale: "en", status: "clean", unitId: "x" }),
      ),
    ).toEqual({ status: "invalid" });
    expect(markUnits).not.toHaveBeenCalled();
  });
});
