/**
 * What a closed destination says, for each gate that can close it, in each of
 * the three languages (RANZ-53). The gate is decided in the database and proved
 * in tests/integration/screen-denial.test.ts; what is asserted here is the
 * sentence each answer is given, and that none of them says a Subscription to
 * somebody whose Subscription is not what stopped them.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Denial } from "../../packages/ranza/core/src";
import { messages } from "../../apps/operator-workspace/src/messages";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/hr",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { ScreenDenied } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/screen-denied");

function show(locale: "en" | "tr" | "ar", denial: Denial) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScreenDenied denial={denial} locale={locale} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

const LOCALES = ["en", "tr", "ar"] as const;

describe("a closed destination", () => {
  for (const locale of LOCALES) {
    const t = messages[locale].denied;

    it(`DENY-11: ${locale} names a Property that is not one the viewer reaches, and the way back`, () => {
      show(locale, { reason: "not_reachable" });
      expect(
        screen.getByRole("heading", { name: t.notReachableTitle }),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: t.goToToday })).toHaveAttribute(
        "href",
        `/${locale}/today`,
      );
    });

    it(`DENY-12: ${locale} says it is the Subscription only where it is`, () => {
      show(locale, { reason: "not_subscribed" });
      expect(
        screen.getByRole("heading", { name: t.notSubscribedTitle }),
      ).toBeInTheDocument();
    });

    it(`DENY-13: ${locale} says the Property has it switched off`, () => {
      show(locale, { reason: "not_enabled" });
      expect(
        screen.getByRole("heading", { name: t.notEnabledTitle }),
      ).toBeInTheDocument();
      expect(screen.queryByText(t.notSubscribedTitle)).not.toBeInTheDocument();
    });

    it(`DENY-14: ${locale} names the permission the role lacks, as the People screen words it`, () => {
      show(locale, { reason: "no_permission", permission: "hr.view" });
      expect(
        screen.getByRole("heading", { name: t.noPermissionTitle }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(new RegExp(messages[locale].staff.permissions.viewHr)),
      ).toBeInTheDocument();
      expect(screen.queryByText(/\{permission\}/)).not.toBeInTheDocument();
    });

    it(`DENY-15: ${locale} does not blame the Subscription when nothing denies`, () => {
      show(locale, { reason: "open" });
      expect(
        screen.getByRole("heading", { name: t.openTitle }),
      ).toBeInTheDocument();
    });
  }

  it("DENY-16: a viewer who reaches no Property is told that, in the words the other screens use", () => {
    show("en", { reason: "no_property" });
    expect(
      screen.getByRole("heading", { name: messages.en.noPropertyTitle }),
    ).toBeInTheDocument();
  });
});
