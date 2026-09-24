/**
 * What the People screen's commands do with a failure.
 *
 * Every failure is shown as one of a few outcomes, and most as `refused`,
 * because telling a missing Organization from a missing permission would say
 * too much. That is also how F-1 hid: `changeStaffRole` handed the module a
 * key it could not use, every role change failed, the screen said "refused",
 * and nothing recorded why. The module's own refusals are expected and stay
 * quiet; anything else is a fault and is logged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LastAdministratorError,
  StaffRefusedError,
} from "../../packages/ranza/staff/src";

const changeRole = vi.fn();

// Resolved from the application's own node_modules, which is where the
// actions import it from.
vi.mock("../../apps/operator-workspace/node_modules/next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  currentViewer: async () => ({
    userId: "d9000001-0000-4000-8000-000000000001",
  }),
}));
vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({ staff: { changeRole } }),
}));

const { changeStaffRole } =
  await import("../../apps/operator-workspace/src/server/staff");

function aRoleChange(): FormData {
  const form = new FormData();
  form.set("locale", "en");
  form.set("organization", "d9000002-0000-4000-8000-000000000001");
  form.set("member", "d9000001-0000-4000-8000-000000000002");
  form.set("role", ":housekeeping");
  return form;
}

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  changeRole.mockReset();
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("a staff command that fails", () => {
  it("logs a fault before showing it as refused", async () => {
    const fault = new TypeError("roleKey is not a role");
    changeRole.mockRejectedValue(fault);

    expect(await changeStaffRole("idle", aRoleChange())).toBe("refused");
    expect(logged).toHaveBeenCalledWith("staff command failed", fault);
  });

  it("keeps the module's own refusal quiet", async () => {
    changeRole.mockRejectedValue(new StaffRefusedError("that was refused"));

    expect(await changeStaffRole("idle", aRoleChange())).toBe("refused");
    expect(logged).not.toHaveBeenCalled();
  });

  it("and the refusal a person can act on, which has its own outcome", async () => {
    changeRole.mockRejectedValue(new LastAdministratorError("find another"));

    expect(await changeStaffRole("idle", aRoleChange())).toBe(
      "lastAdministrator",
    );
    expect(logged).not.toHaveBeenCalled();
  });

  it("passes the role on as the pair the module wants", async () => {
    changeRole.mockResolvedValue(undefined);

    expect(await changeStaffRole("idle", aRoleChange())).toBe("done");
    expect(changeRole).toHaveBeenCalledWith(
      { userId: "d9000001-0000-4000-8000-000000000001" },
      {
        organizationId: "d9000002-0000-4000-8000-000000000001",
        userId: "d9000001-0000-4000-8000-000000000002",
        roleKey: "housekeeping",
      },
    );
  });
});
