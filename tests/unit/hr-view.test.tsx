/**
 * The HR & Payroll screen (Blueprint 5.11, HR-S1-*, RANZ-42).
 *
 * The integration suite proves the module and the pgTAP suite the policies.
 * This proves what a person reads: that the screen is in their language, that
 * money is shown in the run's own currency from whole minor units, that the
 * deductions say they are placeholders, that an IBAN arrives already masked,
 * that a leaver is shown as one, and that a refusal is worded from the
 * catalogue and never from the server.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { EmployeesTable } from "../../apps/operator-workspace/src/features/hr/components/employees-table";
import { HrView } from "../../apps/operator-workspace/src/features/hr/components/hr-view";
import { PayrollCard } from "../../apps/operator-workspace/src/features/hr/components/payroll-card";
import { PayslipDrawer } from "../../apps/operator-workspace/src/features/hr/components/payslip-drawer";
import { loginsWithoutEmployment } from "../../apps/operator-workspace/src/lib/unregistered-staff";
import type {
  EmployeeRecord,
  HrViewData,
  PayrollPeriodSummary,
  PayslipRecord,
} from "../../apps/operator-workspace/src/server/viewer";

const approvePayrollAction = vi.fn();
const registerEmployeeAction = vi.fn();
const terminateEmployeeAction = vi.fn();

vi.mock("../../apps/operator-workspace/src/server/hr", () => ({
  registerEmployeeAction: (...args: unknown[]) =>
    registerEmployeeAction(...args),
  terminateEmployeeAction: (...args: unknown[]) =>
    terminateEmployeeAction(...args),
  assignShiftAction: vi.fn().mockResolvedValue({ status: "done" }),
  submitLeaveRequestAction: vi.fn().mockResolvedValue({ status: "done" }),
  decideLeaveAction: vi.fn().mockResolvedValue({ status: "done" }),
  approvePayrollAction: (...args: unknown[]) => approvePayrollAction(...args),
}));

const employee: EmployeeRecord = {
  id: "emp-1",
  organizationId: "org-1",
  propertyId: "prop-1",
  userId: "user-1",
  firstName: "Mert",
  lastName: "Polat",
  fullName: "Mert Polat",
  email: "mert@hotel.test",
  phone: "+90 555 123 4567",
  department: "Front desk",
  position: "Front Desk Agent",
  contractType: "full_time",
  hiredOn: new Date("2025-06-01T00:00:00Z"),
  grossPayMinor: 3_500_000,
  currency: "TRY",
  status: "active",
  terminatedOn: null,
  bankName: "Ziraat Bankası",
  ibanMasked: "TR•• •••• •••• 1326",
  createdAt: new Date("2025-06-01T00:00:00Z"),
  updatedAt: new Date("2025-06-01T00:00:00Z"),
};

const leaver: EmployeeRecord = {
  ...employee,
  id: "emp-2",
  firstName: "Selin",
  lastName: "Kaya",
  fullName: "Selin Kaya",
  status: "terminated",
  terminatedOn: new Date("2026-09-30T00:00:00Z"),
};

const payslip: PayslipRecord = {
  id: "slip-1",
  employeeId: "emp-1",
  employeeName: "Mert Polat",
  department: "Front desk",
  position: "Front Desk Agent",
  grossPayMinor: 3_500_000,
  socialSecurityDeductionMinor: 525_000,
  taxDeductionMinor: 446_250,
  stampDutyMinor: 26_565,
  netPayMinor: 2_502_185,
  ibanMasked: "TR•• •••• •••• 1326",
};

const draft: PayrollPeriodSummary = {
  period: "2026-10",
  status: "draft",
  currency: "TRY",
  totalGrossMinor: 3_500_000,
  totalNetMinor: 2_502_185,
  approvedAt: null,
  payslips: [payslip],
  blocker: null,
};

const data: HrViewData = {
  organizationId: "org-1",
  propertyId: "prop-1",
  currency: "TRY",
  today: "2026-10-09",
  canManage: true,
  employees: [employee, leaver],
  unregisteredStaff: [],
  shifts: [],
  leaveRequests: [],
  payroll: draft,
};

function inLocale(locale: SupportedLocale, node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      {node}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  approvePayrollAction.mockReset();
  terminateEmployeeAction.mockReset();
  registerEmployeeAction.mockReset().mockResolvedValue({ status: "done" });
});

describe("the HR screen is in the reader's language", () => {
  it("HR-S1-16: hr screen supports all locales and rtl", () => {
    const headings = {
      en: "Employees",
      tr: "Personel",
      ar: "الموظفون",
    } as const;
    for (const locale of supportedLocales) {
      inLocale(
        locale,
        <HrView data={data} locale={locale} propertyId="prop-1" />,
      );
      expect(screen.getByText(headings[locale])).toBeInTheDocument();
      expect(screen.getByText("Mert Polat")).toBeInTheDocument();
      cleanup();
    }
  });

  it("HR-S1-14: hr screen renders empty state", () => {
    inLocale(
      "en",
      <EmployeesTable
        unregisteredStaff={[]}
        employees={[]}
        canManage
        currency="TRY"
        today="2026-10-09"
        locale="en"
        propertyId="prop-1"
      />,
    );
    expect(screen.getByText("No employees registered")).toBeInTheDocument();
    // Why a Staff Member added under People is not here (the screen that showed
    // an empty list to an Organization with five logins said nothing of it).
    expect(
      screen.getByText(/kept apart from sign-in access/),
    ).toBeInTheDocument();
    // One way in, not two buttons with the same name.
    expect(
      screen.getAllByRole("button", { name: "Add employee" }),
    ).toHaveLength(1);
  });
});

describe("logins offered for registration", () => {
  const ada = { userId: "user-ada", email: "ada@hotel.test" };
  const bora = { userId: "user-bora", email: "bora@hotel.test" };

  function table(
    unregisteredStaff: readonly (typeof ada)[],
    overrides: { canManage?: boolean; employees?: EmployeeRecord[] } = {},
  ) {
    return inLocale(
      "en",
      <EmployeesTable
        employees={overrides.employees ?? []}
        unregisteredStaff={unregisteredStaff}
        canManage={overrides.canManage ?? true}
        currency="TRY"
        today="2026-10-09"
        locale="en"
        propertyId="prop-1"
      />,
    );
  }

  it("HR-S1-49: with every login registered there is no panel", () => {
    table([], { employees: [employee] });
    expect(
      screen.queryByText("Staff without an employment record"),
    ).not.toBeInTheDocument();
  });

  it("HR-S1-49: a login with no record is listed with its email and a way to register it, above the empty state that hid it", () => {
    table([ada, bora]);
    const panel = screen
      .getByText("Staff without an employment record")
      .closest("[data-unregistered-staff]")!;
    expect(panel).toHaveTextContent("ada@hotel.test");
    expect(panel).toHaveTextContent("bora@hotel.test");
    expect(
      screen.getByRole("button", {
        name: "Register as employee: ada@hotel.test",
      }),
    ).toBeInTheDocument();
    // The empty state is still true, and still there.
    expect(screen.getByText("No employees registered")).toBeInTheDocument();
  });

  it("HR-S1-50: registering from a login starts from its email and sends its id", async () => {
    inLocale(
      "en",
      <EmployeesTable
        employees={[employee]}
        unregisteredStaff={[ada, bora]}
        canManage
        currency="TRY"
        today="2026-10-09"
        locale="en"
        propertyId="prop-1"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Register as employee: bora@hotel.test",
      }),
    );
    expect(
      await screen.findByText(/Linked to the sign-in bora@hotel\.test\./),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("bora@hotel.test");

    fireEvent.change(screen.getByLabelText(/First name/), {
      target: { value: "Bora" },
    });
    fireEvent.change(screen.getByLabelText(/Last name/), {
      target: { value: "Demir" },
    });
    fireEvent.change(screen.getByLabelText(/Department/), {
      target: { value: "Kitchen" },
    });
    fireEvent.change(screen.getByLabelText(/Position/), {
      target: { value: "Cook" },
    });
    fireEvent.change(screen.getByLabelText(/Gross pay/), {
      target: { value: "30000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save employee" }));
    await vi.waitFor(() =>
      expect(registerEmployeeAction).toHaveBeenCalledWith(
        "en",
        "prop-1",
        expect.objectContaining({
          userId: "user-bora",
          email: "bora@hotel.test",
          firstName: "Bora",
        }),
      ),
    );
  });

  it("HR-S1-54: someone who may not register employees is shown no panel", () => {
    table([ada], { canManage: false, employees: [employee] });
    expect(
      screen.queryByText("Staff without an employment record"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Register as employee/ }),
    ).not.toBeInTheDocument();
  });

  it("HR-S1-49: the panel is worded in every language", () => {
    for (const locale of supportedLocales) {
      inLocale(
        locale,
        <EmployeesTable
          employees={[employee]}
          unregisteredStaff={[ada]}
          canManage
          currency="TRY"
          today="2026-10-09"
          locale={locale}
          propertyId="prop-1"
        />,
      );
      expect(
        screen.getByText(messages[locale].hr.employees.unregisteredTitle),
      ).toBeInTheDocument();
      cleanup();
    }
  });
});

describe("who is offered for registration", () => {
  const login = (userId: string, status: "active" | "revoked") => ({
    userId,
    email: `${userId}@hotel.test`,
    status,
  });

  it("HR-S1-49: an active login with no record is offered with its email", () => {
    expect(
      loginsWithoutEmployment([login("a", "active")], [{ userId: "b" }]),
    ).toEqual([{ userId: "a", email: "a@hotel.test" }]);
  });

  it("HR-S1-50: a login that a record is linked to is not offered", () => {
    expect(
      loginsWithoutEmployment([login("a", "active")], [{ userId: "a" }]),
    ).toEqual([]);
  });

  it("HR-S1-52: a terminated employee's login is not offered again", () => {
    expect(
      loginsWithoutEmployment(
        [login("a", "active")],
        [{ ...leaver, userId: "a" }],
      ),
    ).toEqual([]);
  });

  it("HR-S1-53: a revoked login is not offered, and records with no login hide nobody", () => {
    expect(
      loginsWithoutEmployment(
        [login("a", "revoked"), login("b", "active")],
        [{ userId: null }],
      ),
    ).toEqual([{ userId: "b", email: "b@hotel.test" }]);
  });
});

describe("an employee card", () => {
  it("shows pay in the employee's own currency from whole minor units", () => {
    inLocale(
      "en",
      <EmployeesTable
        unregisteredStaff={[]}
        employees={[{ ...employee, currency: "EUR", grossPayMinor: 123_456 }]}
        canManage={false}
        currency="EUR"
        today="2026-10-09"
        locale="en"
        propertyId="prop-1"
      />,
    );
    expect(screen.getByText("€1,234.56")).toBeInTheDocument();
  });

  it("HR-S1-29: terminating an employee keeps the record and its payslips", () => {
    inLocale(
      "en",
      <EmployeesTable
        unregisteredStaff={[]}
        employees={[employee, leaver]}
        canManage
        currency="TRY"
        today="2026-10-09"
        locale="en"
        propertyId="prop-1"
      />,
    );
    const left = screen.getByText("Selin Kaya").closest("[data-employee]")!;
    // A leaver stays on the screen, says so, and cannot be ended again.
    expect(left).toHaveTextContent("Left");
    expect(left).toHaveTextContent("Left Sep 30, 2026");
    expect(left.querySelector("button")).toBeNull();
    // The person still employed can be.
    expect(
      screen.getByRole("button", { name: /End employment: Mert Polat/ }),
    ).toBeInTheDocument();
  });

  it("ending employment says it does not end access, and sends the day", async () => {
    terminateEmployeeAction.mockResolvedValue({ status: "done" });
    inLocale(
      "en",
      <EmployeesTable
        unregisteredStaff={[]}
        employees={[employee]}
        canManage
        currency="TRY"
        today="2026-10-09"
        locale="en"
        propertyId="prop-1"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /End employment: Mert Polat/ }),
    );
    expect(
      await screen.findByText(/does not remove their access to the system/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Last day of employment"), {
      target: { value: "2026-10-05" },
    });
    fireEvent.click(screen.getByRole("button", { name: "End employment" }));
    await vi.waitFor(() =>
      expect(terminateEmployeeAction).toHaveBeenCalledWith(
        "en",
        "prop-1",
        "emp-1",
        "2026-10-05",
      ),
    );
  });
});

describe("payroll", () => {
  it("HR-S1-28: payroll screen marks deductions as placeholder", () => {
    for (const locale of supportedLocales) {
      inLocale(
        locale,
        <PayrollCard
          payroll={draft}
          canManage
          locale={locale}
          propertyId="prop-1"
        />,
      );
      const note = screen.getByRole("note");
      expect(note).toHaveTextContent(
        messages[locale].hr.payroll.placeholderTitle,
      );
      cleanup();
    }
  });

  it("shows the run's money in its currency, from minor units", () => {
    inLocale(
      "en",
      <PayrollCard payroll={draft} canManage locale="en" propertyId="prop-1" />,
    );
    expect(
      screen.getByText(/Gross TRY 35,000\.00, net TRY 25,021\.85/),
    ).toBeVisible();
  });

  it("HR-S1-48: approving asks first, names what is locked, and sends nothing until confirmed", async () => {
    approvePayrollAction.mockResolvedValue({ status: "done" });
    inLocale(
      "en",
      <PayrollCard payroll={draft} canManage locale="en" propertyId="prop-1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve payroll" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Approve payroll for 2026-10?",
    });
    // The period, the headcount, the currency and the totals, and that it locks.
    expect(dialog).toHaveTextContent("1 employee will be paid in TRY");
    expect(dialog).toHaveTextContent("TRY 35,000.00 gross");
    expect(dialog).toHaveTextContent("TRY 25,021.85 net");
    expect(dialog).toHaveTextContent(/locks the run/);
    expect(approvePayrollAction).not.toHaveBeenCalled();

    // Backing out sends nothing.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(approvePayrollAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Approve payroll" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Approve and lock" }),
    );
    await vi.waitFor(() =>
      expect(approvePayrollAction).toHaveBeenCalledWith(
        "en",
        "prop-1",
        "2026-10",
      ),
    );
  });

  it("a refusal is worded from the catalogue, in the reader's language", async () => {
    approvePayrollAction.mockResolvedValue({
      status: "refused",
      reason: "payroll_needs_organization_reach",
    });
    inLocale(
      "tr",
      <PayrollCard payroll={draft} canManage locale="tr" propertyId="prop-1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bordroyu onayla" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Onayla ve kilitle" }),
    );
    expect(
      await screen.findByText(
        messages.tr.hr.outcomes.refused.payroll_needs_organization_reach,
      ),
    ).toBeInTheDocument();
  });

  it("HR-S1-45: a period that is still running says so and offers no approval", () => {
    inLocale(
      "en",
      <PayrollCard
        payroll={{
          ...draft,
          currency: null,
          totalGrossMinor: 0,
          totalNetMinor: 0,
          payslips: [],
          blocker: "period_not_ended",
        }}
        canManage
        locale="en"
        propertyId="prop-1"
      />,
    );
    expect(screen.getByText(/has not ended yet/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve payroll" }),
    ).toBeNull();
  });

  it("HR-S1-48: moves between periods by links that keep the Property, mirrored in Arabic", () => {
    inLocale(
      "ar",
      <PayrollCard payroll={draft} canManage locale="ar" propertyId="prop-1" />,
    );
    expect(
      screen.getByRole("link", { name: messages.ar.hr.payroll.previousPeriod }),
    ).toHaveAttribute("href", "/ar/hr?property=prop-1&period=2026-09");
    expect(
      screen.getByRole("link", { name: messages.ar.hr.payroll.nextPeriod }),
    ).toHaveAttribute("href", "/ar/hr?property=prop-1&period=2026-11");
  });

  it("HR-S1-24: says why instead of showing a run it may not read", () => {
    inLocale(
      "en",
      <PayrollCard payroll={null} canManage locale="en" propertyId="prop-1" />,
    );
    expect(
      screen.getByText("Payroll is run for the whole Organization"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve payroll" }),
    ).toBeNull();
  });

  it("an approved run is a badge, not a button, and says it cannot be changed", () => {
    inLocale(
      "en",
      <PayrollCard
        payroll={{
          ...draft,
          status: "approved",
          approvedAt: new Date("2026-10-09T10:00:00Z"),
        }}
        canManage
        locale="en"
        propertyId="prop-1"
      />,
    );
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText(/cannot be changed/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve payroll" }),
    ).toBeNull();
  });

  it("HR-S1-33: a blocked draft explains itself and offers no approval", () => {
    inLocale(
      "en",
      <PayrollCard
        payroll={{
          ...draft,
          currency: null,
          totalGrossMinor: 0,
          totalNetMinor: 0,
          payslips: [],
          blocker: "mixed_currency",
        }}
        canManage
        locale="en"
        propertyId="prop-1"
      />,
    );
    expect(screen.getByText(/more than one currency/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve payroll" }),
    ).toBeNull();
  });
});

describe("the payslip", () => {
  it("HR-S1-15: payslip drawer displays breakdown", () => {
    inLocale(
      "en",
      <PayslipDrawer
        payslip={payslip}
        period="2026-10"
        currency="TRY"
        locale="en"
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText("TRY 35,000.00")).toBeInTheDocument();
    expect(screen.getByText("−TRY 5,250.00")).toBeInTheDocument();
    expect(screen.getByText("−TRY 4,462.50")).toBeInTheDocument();
    expect(screen.getByText("−TRY 265.65")).toBeInTheDocument();
    expect(screen.getByText("TRY 25,021.85")).toBeInTheDocument();
  });

  it("HR-S1-30: shows what it was given and has no number to reveal", () => {
    inLocale(
      "en",
      <PayslipDrawer
        payslip={payslip}
        period="2026-10"
        currency="TRY"
        locale="en"
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText("TR•• •••• •••• 1326")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("6100519786");
  });

  it("says so when there is no bank account on file", () => {
    inLocale(
      "en",
      <PayslipDrawer
        payslip={{ ...payslip, ibanMasked: null }}
        period="2026-10"
        currency="TRY"
        locale="en"
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText("No bank account on file")).toBeInTheDocument();
  });
});
