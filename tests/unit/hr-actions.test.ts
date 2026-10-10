/**
 * What the HR screen's actions answer, and what they record (RANZ-42).
 *
 * The module proves the commands and the catalogue proves the words. This
 * proves the step between them: that a failure is turned into a status and a
 * reason and never into the module's text, that the one failure nobody expected
 * is recorded rather than shown as one more refusal, and that an amount is read
 * in the Property's currency and not in whichever one the form claims.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const registerEmployee = vi.fn();
const terminateEmployee = vi.fn();
const approvePayroll = vi.fn();
const decideLeave = vi.fn();
const workplace = vi.fn();
const revalidatePath = vi.fn();

// The application resolves its own copy of next, so the mock names that copy.
vi.mock("../../apps/operator-workspace/node_modules/next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  HR_CAPABILITY: {
    moduleKey: "human_resources",
    capabilityKey: "staff_administration",
  },
  currentViewer: async () => ({ userId: VIEWER }),
  entitledProperties: async () => [
    { propertyId: PROPERTY, organizationId: ORGANIZATION },
  ],
}));
vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({
    hr: {
      registerEmployee,
      terminateEmployee,
      approvePayroll,
      decideLeave,
      workplace,
    },
  }),
}));

const VIEWER = "df000001-0000-4000-8000-000000000001";
const ORGANIZATION = "df000002-0000-4000-8000-000000000001";
const PROPERTY = "df000003-0000-4000-8000-000000000001";
const OTHER_PROPERTY = "df000003-0000-4000-8000-000000000002";
const EMPLOYEE = "df000004-0000-4000-8000-000000000001";

const hr = await import("../../apps/operator-workspace/src/server/hr");
const { HrInputError, HrRefusedError } =
  await import("../../packages/ranza/hr/src");

const person = {
  firstName: "Ada",
  lastName: "Lovelace",
  department: "Front desk",
  position: "Agent",
  grossPay: "35000.50",
};

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const command of [
    registerEmployee,
    terminateEmployee,
    approvePayroll,
    decideLeave,
  ]) {
    command.mockReset().mockResolvedValue(undefined);
  }
  workplace
    .mockReset()
    .mockResolvedValue({ currency: "TRY", today: "2026-10-09" });
  revalidatePath.mockReset();
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  logged.mockRestore();
});

describe("registering an employee", () => {
  it("reads the pay in the Property's currency, which the form cannot name", async () => {
    workplace.mockResolvedValue({ currency: "KWD", today: "2026-10-09" });
    const outcome = await hr.registerEmployeeAction("en", PROPERTY, {
      ...person,
      grossPay: "12.345",
    });

    expect(outcome).toEqual({ status: "done" });
    expect(registerEmployee).toHaveBeenCalledWith(
      VIEWER,
      expect.objectContaining({
        organizationId: ORGANIZATION,
        propertyId: PROPERTY,
        grossPayMinor: 12_345,
        currency: "KWD",
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/en/hr");
  });

  it("reads an Arabic keyboard's digits and separator like any other money field", async () => {
    await hr.registerEmployeeAction("ar", PROPERTY, {
      ...person,
      grossPay: "٣٥٠٠٠٫٥٠",
    });
    expect(registerEmployee).toHaveBeenCalledWith(
      VIEWER,
      expect.objectContaining({ grossPayMinor: 3_500_050 }),
    );
  });

  it("HR-S1-32: more decimals than the currency has is invalid, and nothing is called", async () => {
    const outcome = await hr.registerEmployeeAction("en", PROPERTY, {
      ...person,
      grossPay: "35000.505",
    });
    expect(outcome).toEqual({ status: "invalid", field: "grossPay" });
    expect(registerEmployee).not.toHaveBeenCalled();
  });

  it("refuses a Property the viewer cannot use HR at, without saying what exists", async () => {
    const outcome = await hr.registerEmployeeAction(
      "en",
      OTHER_PROPERTY,
      person,
    );
    expect(outcome).toEqual({ status: "refused", reason: "not_permitted" });
    expect(registerEmployee).not.toHaveBeenCalled();
  });

  it("refuses a malformed post as invalid, never as a crash", async () => {
    expect(await hr.registerEmployeeAction("xx", PROPERTY, person)).toEqual({
      status: "invalid",
      field: "request",
    });
    expect(await hr.registerEmployeeAction("en", "not-a-uuid", person)).toEqual(
      {
        status: "invalid",
        field: "request",
      },
    );
  });
});

describe("what a failed command becomes", () => {
  it("a refusal is its reason and is not logged", async () => {
    approvePayroll.mockRejectedValue(
      new HrRefusedError("payroll_needs_organization_reach"),
    );
    const outcome = await hr.approvePayrollAction("en", PROPERTY, "2026-10");

    expect(outcome).toEqual({
      status: "refused",
      reason: "payroll_needs_organization_reach",
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it("an input the module refuses is the field, and is not logged", async () => {
    registerEmployee.mockRejectedValue(new HrInputError("iban"));
    const outcome = await hr.registerEmployeeAction("en", PROPERTY, person);

    expect(outcome).toEqual({ status: "invalid", field: "iban" });
    expect(logged).not.toHaveBeenCalled();
  });

  it("HR-S1-42: an unexpected failure is reported and shown without its message", async () => {
    const outage = new Error(
      "connection to 10.0.0.7 refused; password=hunter2",
    );
    approvePayroll.mockRejectedValue(outage);
    const outcome = await hr.approvePayrollAction("en", PROPERTY, "2026-10");

    // What the person sees carries nothing the server said ...
    expect(outcome).toEqual({ status: "error" });
    expect(JSON.stringify(outcome)).not.toContain("hunter2");
    // ... and the operator is told, with the error, who and where.
    expect(logged).toHaveBeenCalledWith(
      "hr.approve_payroll_failed",
      { propertyId: PROPERTY, userId: VIEWER },
      outage,
    );
  });

  it("a command that was refused still refreshes the page, which is probably older than the truth", async () => {
    decideLeave.mockRejectedValue(new HrRefusedError("leave_decided"));
    await hr.decideLeaveAction(
      "en",
      PROPERTY,
      "df000005-0000-4000-8000-000000000001",
      true,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/en/hr");
  });
});

describe("approving payroll", () => {
  it("asks for the Organization and the period and decides nothing itself", async () => {
    const outcome = await hr.approvePayrollAction("en", PROPERTY, "2026-10");

    expect(outcome).toEqual({ status: "done" });
    expect(approvePayroll).toHaveBeenCalledWith(VIEWER, {
      organizationId: ORGANIZATION,
      period: "2026-10",
    });
  });
});

describe("ending employment", () => {
  it("sends the day the person typed", async () => {
    await hr.terminateEmployeeAction("en", PROPERTY, EMPLOYEE, "2026-10-20");
    expect(terminateEmployee).toHaveBeenCalledWith(VIEWER, {
      organizationId: ORGANIZATION,
      employeeId: EMPLOYEE,
      terminatedOn: new Date("2026-10-20T00:00:00Z"),
    });
  });

  it("refuses a day that is not one", async () => {
    expect(
      await hr.terminateEmployeeAction("en", PROPERTY, EMPLOYEE, "2026-02-31"),
    ).toEqual({ status: "invalid", field: "terminatedOn" });
    expect(terminateEmployee).not.toHaveBeenCalled();
  });
});
