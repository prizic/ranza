/**
 * What the audit log says about the HR records (RANZ-42, HR-S1-37).
 *
 * The HR writers record ids, enums, days and counts. A key the log does not
 * know is shown as itself, which is visible but unfinished; this holds that
 * none of the HR keys is one, that a leave's days are not labelled Arrival and
 * Departure, and that the totals of a payroll run are money.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import {
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import { ContextFacts } from "../../apps/operator-workspace/src/features/audit-log/components/context-facts";
import type { AuditWords } from "../../apps/operator-workspace/src/features/audit-log/words";
import { messages } from "../../apps/operator-workspace/src/messages";

const words = { name: (id: string) => id.slice(0, 8) } as unknown as AuditWords;

function facts(
  locale: SupportedLocale,
  action: string,
  context: Record<string, unknown>,
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ContextFacts
        action={action}
        context={context}
        locale={locale}
        words={words}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("the HR records on the audit screen", () => {
  it("HR-S1-37: a leave decision names the days as leave and the kind in the HR screen's words", () => {
    facts("en", "leave.approved", {
      employeeId: "9e222222-2222-4222-8222-222222222222",
      leaveType: "sick",
      leaveFrom: "2027-02-01",
      leaveTo: "2027-02-05",
    });

    expect(screen.getByText("Leave from")).toBeInTheDocument();
    expect(screen.getByText("Leave until")).toBeInTheDocument();
    expect(screen.getByText("Sick leave")).toBeInTheDocument();
    expect(screen.getByText("Feb 1, 2027")).toBeInTheDocument();
    // Not a booking's Arrival and Departure.
    expect(screen.queryByText("Arrival")).toBeNull();
  });

  it("HR-S1-37: a payroll approval reads its totals as money in the run's currency", () => {
    facts("en", "payroll_run.approved", {
      period: "2026-10",
      currency: "TRY",
      employeeCount: 3,
      totalGrossMinor: 3_500_055,
      totalNetMinor: 2_502_224,
    });

    expect(screen.getByText("Payroll period")).toBeInTheDocument();
    expect(screen.getByText("Employees paid")).toBeInTheDocument();
    expect(screen.getByText("TRY 35,000.55")).toBeInTheDocument();
    expect(screen.getByText("TRY 25,022.24")).toBeInTheDocument();
    // The currency is folded into the amounts, not a row of its own.
    expect(screen.queryByText("currency")).toBeNull();
  });

  it("HR-S1-37: a registration and an ending are labelled in every language", () => {
    for (const locale of supportedLocales) {
      const registered = facts(locale, "employee.registered", {
        contractType: "full_time",
        currency: "TRY",
        hasSystemAccess: false,
      });
      expect(
        screen.getByText(messages[locale].auditContext.contractType),
      ).toBeInTheDocument();
      expect(
        screen.getByText(messages[locale].hr.employees.contracts.full_time),
      ).toBeInTheDocument();
      expect(
        screen.getByText(messages[locale].auditContext.hasSystemAccess),
      ).toBeInTheDocument();
      registered.unmount();

      facts(locale, "employee.terminated", { terminatedOn: "2026-10-31" });
      expect(
        screen.getByText(messages[locale].auditContext.terminatedOn),
      ).toBeInTheDocument();
      cleanup();
    }
  });
});
