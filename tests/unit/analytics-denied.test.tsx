/**
 * Analytics refuses a Front desk Staff Member in words that fit the page
 * (FINANCE-16). The page is gated on `finance.view_ledger`, which the audit
 * found worded "Read the general ledger" for a page of occupancy and rates. The
 * permission is one key that gates the ledger and the revenue reports, so its
 * label says both, in each language.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/analytics",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { ScreenDenied } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/screen-denied");

afterEach(cleanup);

describe("Analytics refused for a role without the ledger permission", () => {
  it("FINANCE-16: the refusal names a permission that covers revenue reports, in each language", () => {
    for (const locale of ["en", "tr", "ar"] as const) {
      render(
        <NextIntlClientProvider locale={locale} messages={messages[locale]}>
          <ScreenDenied
            denial={{
              reason: "no_permission",
              permission: "finance.view_ledger",
            }}
            locale={locale}
          />
        </NextIntlClientProvider>,
      );
      const label = messages[locale].staff.permissions.viewLedger;
      expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
      expect(label).not.toMatch(/general ledger|genel/i);
      cleanup();
    }
  });

  it("FINANCE-16: the label says revenue reports, not only the ledger", () => {
    expect(messages.en.staff.permissions.viewLedger).toMatch(/revenue reports/);
    expect(messages.tr.staff.permissions.viewLedger).toMatch(/gelir raporları/);
    expect(messages.ar.staff.permissions.viewLedger).toMatch(
      /تقارير الإيرادات/,
    );
  });
});
