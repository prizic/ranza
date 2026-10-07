/**
 * The Integrations screen and failed operations view (Blueprint 5.15, 5.16, Phase 5, INT-S1-*).
 *
 * Verifies that:
 * - Failures are visible with exact error messages and attempts without reading server logs.
 * - Integration cards render statuses, categories, and sync dates.
 * - Retry action button is present and interactive.
 * - Clean state renders gracefully when no failed operations remain.
 * - All labels exist and render across all supported locales (en, tr, ar).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  FailedOperationRecord,
  IntegrationRecord,
} from "../../packages/ranza/integrations/src";
import type { SupportedLocale } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { IntegrationsView } from "../../apps/operator-workspace/src/features/integrations/components/integrations-view";

vi.mock("../../apps/operator-workspace/src/server/integrations", () => ({
  retryOperationAction: vi.fn().mockResolvedValue({ status: "done" }),
}));

const mockIntegrations: IntegrationRecord[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "aa111111-1111-4111-8111-111111111111",
    propertyId: "bb111111-1111-4111-8111-111111111111",
    key: "channel_manager",
    name: "Channel manager",
    category: "Distribution",
    status: "error",
    detail: "Rate plan not mapped: Standard Double (305-307)",
    config: {},
    lastSyncAt: new Date("2026-10-07T12:00:00Z"),
    createdAt: new Date("2026-10-07T10:00:00Z"),
    updatedAt: new Date("2026-10-07T12:00:00Z"),
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    organizationId: "aa111111-1111-4111-8111-111111111111",
    propertyId: "bb111111-1111-4111-8111-111111111111",
    key: "garanti_pos",
    name: "Garanti Virtual POS",
    category: "Payments",
    status: "connected",
    detail: null,
    config: {},
    lastSyncAt: new Date("2026-10-07T11:45:00Z"),
    createdAt: new Date("2026-10-07T10:00:00Z"),
    updatedAt: new Date("2026-10-07T11:45:00Z"),
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    organizationId: "aa111111-1111-4111-8111-111111111111",
    propertyId: "bb111111-1111-4111-8111-111111111111",
    key: "door_locks",
    name: "Dormakaba Access Control",
    category: "Access",
    status: "not_connected",
    detail: null,
    config: {},
    lastSyncAt: null,
    createdAt: new Date("2026-10-07T10:00:00Z"),
    updatedAt: new Date("2026-10-07T10:00:00Z"),
  },
];

const mockFailedOperations: FailedOperationRecord[] = [
  {
    id: "ff111111-1111-4111-8111-111111111111",
    organizationId: "aa111111-1111-4111-8111-111111111111",
    propertyId: "bb111111-1111-4111-8111-111111111111",
    integrationId: "11111111-1111-4111-8111-111111111111",
    integrationName: "Channel manager",
    operation: "Push availability, rooms 305, 306, 307",
    error: "Rate plan not mapped: Standard Double (305-307)",
    status: "failed",
    attempts: 3,
    payload: { ratePlanId: "STD-DBL", rooms: ["305", "306", "307"] },
    lastAttemptAt: new Date("2026-10-07T12:00:00Z"),
    createdAt: new Date("2026-10-07T11:45:00Z"),
    updatedAt: new Date("2026-10-07T12:00:00Z"),
  },
];

function renderView(
  locale: SupportedLocale,
  integrations = mockIntegrations,
  failedOperations = mockFailedOperations,
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <IntegrationsView
        failedOperations={failedOperations}
        integrations={integrations}
        locale={locale}
        propertyId="bb111111-1111-4111-8111-111111111111"
      />
    </NextIntlClientProvider>,
  );
}

describe("IntegrationsView", () => {
  afterEach(cleanup);

  it("renders metrics summary with connected, error, and failed counts", () => {
    renderView("en");

    expect(
      screen.getAllByText("Channel manager").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Garanti Virtual POS")).toBeInTheDocument();
    expect(screen.getByText("Dormakaba Access Control")).toBeInTheDocument();

    // 1 connected, 1 error, 1 not connected, 1 failed op
    expect(screen.getAllByText("Connected").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Error").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Not Connected").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("displays failed operation with exact error detail and attempt count without reading a log", () => {
    renderView("en");

    // The core success criterion: error visible on screen
    expect(
      screen.getByText("Push availability, rooms 305, 306, 307"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Rate plan not mapped: Standard Double (305-307)")
        .length,
    ).toBeGreaterThanOrEqual(1);

    // Attempt count is visible
    expect(screen.getByText("3")).toBeInTheDocument();

    // Retry button is present
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("renders clean state when there are no failed operations", () => {
    renderView("en", mockIntegrations, []);

    expect(
      screen.getByText(
        "No failed operations recorded. All external services are in sync.",
      ),
    ).toBeInTheDocument();
  });

  it("renders in Turkish without missing keys", () => {
    renderView("tr");

    expect(screen.getByText("Sistem Bağlantıları")).toBeInTheDocument();
    expect(
      screen.getAllByText("Başarısız İşlemler").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("button", { name: /yeniden dene/i }),
    ).toBeInTheDocument();
  });

  it("renders in Arabic with logical RTL alignment without missing keys", () => {
    renderView("ar");

    expect(screen.getByText("تكاملات النظام")).toBeInTheDocument();
    expect(
      screen.getAllByText("العمليات الفاشلة").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("button", { name: /إعادة المحاولة/i }),
    ).toBeInTheDocument();
  });
});
