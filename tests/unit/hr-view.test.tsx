/**
 * The HR & Payroll screen component tests (Blueprint 5.11, Phase 4, HR-S1-*).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupportedLocale } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { HrView } from "../../apps/operator-workspace/src/features/hr/components/hr-view";
import type { HrViewData } from "../../apps/operator-workspace/src/server/viewer";

vi.mock("../../apps/operator-workspace/src/server/hr", () => ({
  registerEmployeeAction: vi.fn().mockResolvedValue({ status: "done" }),
  assignShiftAction: vi.fn().mockResolvedValue({ status: "done" }),
  submitLeaveRequestAction: vi.fn().mockResolvedValue({ status: "done" }),
  approveLeaveAction: vi.fn().mockResolvedValue({ status: "done" }),
  approvePayrollAction: vi.fn().mockResolvedValue({ status: "done" }),
}));

const mockHrData: HrViewData = {
  organizationId: "org-1",
  propertyId: "prop-1",
  canManage: true,
  employees: [
    {
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
      grossPay: 35000,
      currency: "TRY",
      status: "active",
      bankName: "Ziraat Bankası",
      iban: "TR12 3456 7890 1234 5678 9012 34",
      createdAt: new Date("2025-06-01T00:00:00Z"),
      updatedAt: new Date("2025-06-01T00:00:00Z"),
    },
  ],
  shifts: [
    {
      id: "shift-1",
      organizationId: "org-1",
      propertyId: "prop-1",
      employeeId: "emp-1",
      employeeName: "Mert Polat",
      date: new Date(),
      shiftType: "morning",
      startTime: "07:00",
      endTime: "15:00",
      notes: null,
    },
  ],
  leaveRequests: [
    {
      id: "leave-1",
      organizationId: "org-1",
      employeeId: "emp-1",
      employeeName: "Mert Polat",
      employeeDepartment: "Front desk",
      employeePosition: "Front Desk Agent",
      leaveType: "annual",
      startsOn: new Date("2026-10-15T00:00:00Z"),
      endsOn: new Date("2026-10-18T00:00:00Z"),
      status: "pending",
      notes: "Family trip",
      clash: true,
    },
  ],
  payroll: {
    period: "2026-10",
    status: "draft",
    totalGross: 35000,
    totalNet: 25021.85,
    approvedAt: null,
    payslips: [
      {
        id: "slip-1",
        employeeId: "emp-1",
        employeeName: "Mert Polat",
        department: "Front desk",
        position: "Front Desk Agent",
        grossPay: 35000,
        socialSecurityDeduction: 5250,
        taxDeduction: 4462.5,
        stampDuty: 265.65,
        netPay: 25021.85,
        iban: "TR12 3456 7890 1234 5678 9012 34",
      },
    ],
  },
};

function renderHr(locale: SupportedLocale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <HrView data={mockHrData} locale={locale} propertyId="prop-1" />
    </NextIntlClientProvider>,
  );
}

describe("HrView Component (HR-S1-*)", () => {
  afterEach(cleanup);

  it("renders page header and tabs correctly in English", () => {
    renderHr("en");

    expect(screen.getByText("HR & Payroll")).toBeInTheDocument();
    expect(screen.getByText("Employees")).toBeInTheDocument();
    expect(screen.getByText("This week")).toBeInTheDocument();
    expect(screen.getByText("Leave")).toBeInTheDocument();
    expect(screen.getByText("Payroll")).toBeInTheDocument();
  });

  it("renders employee cards with details in Turkish", () => {
    renderHr("tr");

    expect(screen.getByText("Mert Polat")).toBeInTheDocument();
    expect(screen.getByText("Front Desk Agent")).toBeInTheDocument();
    expect(screen.getByText("Front desk")).toBeInTheDocument();
  });

  it("renders with RTL support in Arabic", () => {
    renderHr("ar");

    expect(screen.getByText("الموارد البشرية والرواتب")).toBeInTheDocument();
    expect(screen.getByText("الموظفون")).toBeInTheDocument();
  });
});
