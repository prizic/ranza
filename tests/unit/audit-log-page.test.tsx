/**
 * What the audit log page says to somebody who may not read it.
 *
 * Reading the log is the `audit.read` permission and nothing commercial
 * (ADR 0031), so the refusal has to name the permission and who can grant it.
 * It used to borrow the other screens' refusal — "This module is not in your
 * Subscription" — which sent a Front desk member to ask about billing for
 * something no package decides. Found by the evidence run as F-3.
 *
 * The page itself is rendered, with the funnel mocked: which Properties a
 * viewer may open the log from is decided by policies that
 * tests/integration/audit-log.test.ts exercises against a real database. What
 * is asserted here is the sentence the page chooses for each answer.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";

const permittedProperties = vi.fn();
const auditLog = vi.fn();
let locale: SupportedLocale = "en";

// Resolved from the application's own node_modules, which is where the page's
// server helpers import it from; the bare name resolves nowhere from here.
vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  usePathname: () => "/en/audit-log",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    createTranslator({ locale, messages: messages[locale] as never }),
  setRequestLocale: vi.fn(),
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  AUDIT_READ_PERMISSION: "audit.read",
  MIN_SEARCH_LENGTH: 2,
  auditLog,
  auditRecord: vi.fn(),
  permittedProperties,
  requireViewer: async () => ({
    userId: "d9000001-0000-4000-8000-000000000001",
  }),
}));

const { default: AuditLogPage } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/audit-log/page");

async function show(as: SupportedLocale, search: Record<string, string> = {}) {
  locale = as;
  const page = await AuditLogPage({
    params: Promise.resolve({ locale: as }),
    searchParams: Promise.resolve(search),
  });
  render(
    <NextIntlClientProvider locale={as} messages={messages[as]}>
      {page}
    </NextIntlClientProvider>,
  );
}

const KADIKOY = {
  propertyId: "d9000004-0000-4000-8000-000000000001",
  propertyName: "Deniz Otel Kadıköy",
  timezone: "Europe/Istanbul",
  organizationId: "d9000002-0000-4000-8000-000000000001",
  organizationName: "Deniz Otelleri",
};

beforeEach(() => {
  permittedProperties.mockReset();
  auditLog.mockReset();
});
afterEach(cleanup);

describe("the audit log page", () => {
  for (const as of supportedLocales) {
    it(`tells somebody without audit.read it is a permission, in ${as}`, async () => {
      permittedProperties.mockResolvedValue([]);
      await show(as);

      const say = messages[as];
      expect(screen.getByText(say.auditNotPermittedTitle)).toBeInTheDocument();
      expect(
        screen.getByText(say.auditNotPermittedDescription),
      ).toBeInTheDocument();
      // And never the Subscription copy, which is about something else.
      expect(screen.queryByText(say.notEntitledTitle)).not.toBeInTheDocument();
      expect(
        screen.queryByText(say.notEntitledDescription),
      ).not.toBeInTheDocument();
      // Nothing was read on behalf of somebody who may not read it.
      expect(auditLog).not.toHaveBeenCalled();
    });
  }

  it("names the permission by the words the roles grid uses for it", () => {
    for (const as of supportedLocales) {
      const say = messages[as];
      expect(say.auditNotPermittedDescription).toContain(
        say.staff.permissions.readAudit,
      );
    }
  });

  // A named Property no longer falls back to another one (#63), so somebody
  // who may read the log at Kadıköy but has the switcher on Moda lands here.
  // "You can't read the audit log" would be untrue for them.
  for (const as of supportedLocales) {
    it(`sends somebody who may read it elsewhere to the switcher, in ${as}`, async () => {
      permittedProperties.mockResolvedValue([KADIKOY]);
      await show(as, { property: "d9000004-0000-4000-8000-000000000002" });

      const say = messages[as];
      expect(screen.getByText(say.auditNotHereTitle)).toBeInTheDocument();
      expect(screen.getByText(say.auditNotHereDescription)).toBeInTheDocument();
      expect(
        screen.queryByText(say.auditNotPermittedTitle),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(say.notEntitledTitle)).not.toBeInTheDocument();
      expect(auditLog).not.toHaveBeenCalled();
    });
  }

  it("shows somebody who may read it the log, not the refusal", async () => {
    permittedProperties.mockResolvedValue([KADIKOY]);
    auditLog.mockResolvedValue({
      entries: [],
      total: 0,
      nextCursor: null,
      labels: {},
      locations: {},
      roles: {},
    });
    await show("en");

    expect(screen.getByText(messages.en.noAuditTitle)).toBeInTheDocument();
    expect(
      screen.queryByText(messages.en.auditNotPermittedTitle),
    ).not.toBeInTheDocument();
  });
});
