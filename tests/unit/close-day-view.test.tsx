/**
 * The Close the day screen, rendered: what it offers, and what it never says.
 *
 * The browser suite presses the buttons against a real database. These are the
 * interface rows it would take a second signed-in account to reach — a viewer
 * without `front_desk.close_day` — and the ones worth asserting in every
 * language rather than one: nothing on the screen promises Accounting, or says
 * a close cannot be undone (CD-S1-46).
 */
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import type { CloseTheDay } from "../../packages/ranza/business-day/src";
import {
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";

// The server actions, which these components only call. Reaching them would
// drag in the composition root and a database connection.
vi.mock("../../apps/operator-workspace/src/server/close-day", () => ({
  closeBusinessDay: vi.fn(),
}));
vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  cancelBooking: vi.fn(),
  markNoShow: vi.fn(),
}));
// Next lives in the workspace's own node_modules, so it is mocked by that path:
// the bare specifier would not resolve from here, and the component would get
// the real router, which throws outside a mounted app.
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("../../apps/operator-workspace/node_modules/next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const { CloseDayView } =
  await import("../../apps/operator-workspace/src/features/front-office/components/close-day-view");

const DUE: CloseTheDay = {
  propertyId: "d9000005-0000-4000-8000-000000000001",
  today: "2026-09-24",
  cutoff: "04:00",
  dayToClose: "2026-09-23",
  waiting: 1,
  checklistDay: "2026-09-23",
  notArrived: [],
  notDeparted: [],
  foliosLeftOpen: [],
  mayClose: true,
  recent: [],
};

function show(day: CloseTheDay, locale: SupportedLocale = "en") {
  cleanup();
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <CloseDayView day={day} locale={locale} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("who is offered the close", () => {
  it("offers the close to a viewer who holds close_day", () => {
    show(DUE);
    expect(
      screen.getByRole("button", { name: /^Close Wednesday/ }),
    ).toBeTruthy();
  });

  it("the close is not offered to a viewer without the permission", () => {
    show({ ...DUE, mayClose: false });
    expect(screen.queryByRole("button", { name: /^Close / })).toBeNull();
    expect(
      screen.getByText(/closing it needs the Close the day permission/),
    ).toBeTruthy();
  });
});

describe("a day still being worked", () => {
  it("a day still being worked says when it can close", () => {
    show({ ...DUE, dayToClose: null, waiting: 0, checklistDay: "2026-09-24" });
    expect(screen.getByText(/ is still open$/)).toBeTruthy();
    expect(screen.getByText(/can be closed after 04:00/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Close / })).toBeNull();
  });
});

describe("what the screen never says", () => {
  // The words for Accounting, and for "cannot be undone", in each language.
  const promises: Record<SupportedLocale, RegExp> = {
    en: /accounting|cannot be undone/i,
    tr: /muhasebe|geri alınamaz/i,
    ar: /المحاسبة|لا يمكن التراجع عن الإغلاق/,
  };

  for (const locale of supportedLocales) {
    it(`the screen promises nothing that is not built, in ${locale}`, () => {
      show(
        {
          ...DUE,
          waiting: 3,
          foliosLeftOpen: [
            {
              stayId: "d9000005-0000-4000-8000-000000000002",
              folioId: "d9000005-0000-4000-8000-000000000003",
              guestName: "Ada Lovelace",
              departedOn: "2026-09-22",
              unitName: "101",
              roomName: null,
              balanceMinor: 4500,
              currency: "TRY",
            },
          ],
        },
        locale,
      );
      expect(document.body.textContent).not.toMatch(promises[locale]);
    });
  }
});
