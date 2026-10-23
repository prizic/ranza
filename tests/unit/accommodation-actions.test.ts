/**
 * What the Add rooms form becomes, and what comes back (ROOMS-01, ROOMS-03).
 *
 * The integration suite proves the module and the policies. This proves the
 * translation in front of them: that somebody without the permission is told
 * so rather than refused like a Property that is not there, and that every
 * refusal leaves as a fact the screen words, never as the module's English.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const addUnits = vi.fn();
const mayConfigureRooms = vi.fn();
const revalidatePath = vi.fn();

vi.mock("../../apps/operator-workspace/node_modules/next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  currentViewer: async () => ({ userId: VIEWER }),
  mayConfigureRooms: (...args: unknown[]) => mayConfigureRooms(...args),
}));
vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({ accommodation: { addUnits } }),
}));

const VIEWER = "dd000001-0000-4000-8000-000000000001";
const PROPERTY = "dd000003-0000-4000-8000-000000000001";

const { addRooms } =
  await import("../../apps/operator-workspace/src/server/accommodation");
const { UnitConfigurationError, UnitNameTakenError, UnitRefusedError } =
  await import("../../packages/ranza/accommodation/src");

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    locale: "en",
    propertyId: PROPERTY,
    firstNumber: "301",
    count: "3",
    capacity: "2",
    unitType: "room",
    ...fields,
  })) {
    data.append(key, value);
  }
  return data;
}

const idle = { status: "idle" } as const;

beforeEach(() => {
  addUnits.mockReset();
  mayConfigureRooms.mockReset().mockResolvedValue(true);
  revalidatePath.mockReset();
});

describe("adding rooms from the form", () => {
  it("says the permission is missing before it reaches the module (ROOMS-01)", async () => {
    mayConfigureRooms.mockResolvedValue(false);
    expect(await addRooms(idle, form())).toEqual({ status: "notPermitted" });
    expect(mayConfigureRooms).toHaveBeenCalledWith(PROPERTY);
    expect(addUnits).not.toHaveBeenCalled();
  });

  it("answers a batch with the range it wrote (ROOMS-02)", async () => {
    addUnits.mockResolvedValue({
      unitIds: ["a", "b", "c"],
      names: ["301", "302", "303"],
      bedCount: 0,
    });
    expect(await addRooms(idle, form())).toEqual({
      status: "done",
      first: "301",
      last: "303",
      count: 3,
      bedCount: 0,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/en/rooms");
  });

  it("names the room already taken, and not the module's sentence (ROOMS-03)", async () => {
    addUnits.mockRejectedValue(new UnitNameTakenError("302"));
    expect(await addRooms(idle, form())).toEqual({
      status: "taken",
      name: "302",
    });
  });

  it("names the input the module refused (ROOMS-04)", async () => {
    addUnits.mockRejectedValue(
      new UnitConfigurationError("one to sixty rooms in one go", "count"),
    );
    expect(await addRooms(idle, form({ count: "61" }))).toEqual({
      status: "invalid",
      field: "count",
    });
  });

  it("carries no English for a refusal the module answers alike for every cause", async () => {
    addUnits.mockRejectedValue(
      new UnitRefusedError("those rooms cannot be added"),
    );
    expect(await addRooms(idle, form())).toEqual({ status: "refused" });
  });

  it("lets a failure nobody planned for reach the error boundary", async () => {
    addUnits.mockRejectedValue(new Error("connection reset"));
    await expect(addRooms(idle, form())).rejects.toThrow("connection reset");
  });
});
