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
import type {
  EmployeeRecord,
  HrViewData,
  PayrollPeriodSummary,
  PayslipRecord,
} from "../../apps/operator-workspace/src/server/viewer";

const approvePayrollAction = vi.fn();
const terminateEmployeeAction = vi.fn();

vi.mock("../../apps/operator-workspace/src/server/hr", () => ({
  registerEmployeeAction: vi.fn().mockResolvedValue({ status: "done" }),
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
});

describe("the HR screen is in the reader's language", () => {
  it("hr_screen_supports_all_locales_and_rtl", () => {
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

  it("hr_screen_renders_empty_state", () => {
    inLocale(
      "en",
      <EmployeesTable
        employees={[]}
        canManage
        currency="TRY"
        today="2026-10-09"
        locale="en"
        propertyId="prop-1"
      />,
    );
    expect(screen.getByText("No employees registered")).toBeInTheDocument();
    // One way in, not two buttons with the same name.
    expect(
      screen.getAllByRole("button", { name: "Add employee" }),
    ).toHaveLength(1);
  });
});

describe("an employee card", () => {
  it("shows pay in the employee's own currency from whole minor units", () => {
    inLocale(
      "en",
      <EmployeesTable
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

  it("terminating_an_employee_keeps_the_record_and_its_payslips", () => {
    inLocale(
      "en",
      <EmployeesTable
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
      target: { value: "2026-10-20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "End employment" }));
    await vi.waitFor(() =>
      expect(terminateEmployeeAction).toHaveBeenCalledWith(
        "en",
        "prop-1",
        "emp-1",
        "2026-10-20",
      ),
    );
  });
});

describe("payroll", () => {
  it("payroll_screen_marks_deductions_as_placeholder", () => {
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

  it("the whole run is approved from one button, and a refusal is worded from the catalogue", async () => {
    approvePayrollAction.mockResolvedValue({
      status: "refused",
      reason: "payroll_needs_organization_reach",
    });
    inLocale(
      "tr",
      <PayrollCard payroll={draft} canManage locale="tr" propertyId="prop-1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bordroyu onayla" }));
    expect(
      await screen.findByText(
        messages.tr.hr.outcomes.refused.payroll_needs_organization_reach,
      ),
    ).toBeInTheDocument();
    expect(approvePayrollAction).toHaveBeenCalledWith(
      "tr",
      "prop-1",
      "2026-10",
    );
  });

  it("a_property_scoped_manager_cannot_approve_payroll: says why instead of showing a run it may not read", () => {
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

  it("a_run_in_two_currencies_is_refused_and_says_so: a blocked draft explains itself and offers no approval", () => {
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
  it("payslip_drawer_displays_breakdown", () => {
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

  it("iban_is_masked_on_the_server: shows what it was given and has no number to reveal", () => {
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
