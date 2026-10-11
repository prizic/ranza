/**
 * The Integrations screen (Blueprint 5.15, 5.16, Phase 5, ADR 0045, INT-S1-*).
 *
 * Verifies that:
 * - A failed delivery is visible with what happened, how many attempts and when
 *   the next one is, without reading a log.
 * - An endpoint shows how it is doing, and only a Staff Member who may manage it
 *   is offered the commands.
 * - Every label exists in English, Turkish and Arabic, and the screen's own
 *   restatement of the event list is the module's.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type DeliveryFailure,
  WEBHOOK_EVENT_TYPES as MODULE_EVENT_TYPES,
  type EndpointsView,
  type FailedOperationRecord,
} from "../../packages/ranza/integrations/src";
import type { SupportedLocale } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { IntegrationsView } from "../../apps/operator-workspace/src/features/integrations/components/integrations-view";
import {
  DELIVERY_FAILURES,
  eventKey,
  WEBHOOK_EVENT_TYPES,
} from "../../apps/operator-workspace/src/features/integrations/types";

vi.mock("../../apps/operator-workspace/src/server/integrations", () => ({
  registerEndpointAction: vi.fn(),
  removeEndpointAction: vi.fn(),
  sendTestEventAction: vi.fn(),
  retryOperationAction: vi.fn(),
  cancelOperationAction: vi.fn(),
  resolveOperationAction: vi.fn(),
}));

const ORGANIZATION = "aa111111-1111-4111-8111-111111111111";
const PROPERTY = "bb111111-1111-4111-8111-111111111111";

const endpoints = (mayManage: boolean): EndpointsView => ({
  mayManage,
  endpoints: [
    {
      id: "e1111111-1111-4111-8111-111111111111",
      organizationId: ORGANIZATION,
      name: "Channel manager",
      url: "https://hooks.example.test/channel-manager",
      eventTypes: ["stay.checked_in", "folio.line_posted"],
      createdAt: new Date("2026-10-07T10:00:00Z"),
      health: "failing",
      lastDeliveredAt: new Date("2026-10-07T11:45:00Z"),
      queued: 2,
      openFailures: 1,
    },
    {
      id: "e2222222-2222-4222-8222-222222222222",
      organizationId: ORGANIZATION,
      name: "Door locks",
      url: "https://hooks.example.test/doors",
      eventTypes: ["stay.checked_out"],
      createdAt: new Date("2026-10-07T10:00:00Z"),
      health: "delivering",
      lastDeliveredAt: new Date("2026-10-07T12:00:00Z"),
      queued: 0,
      openFailures: 0,
    },
    {
      id: "e3333333-3333-4333-8333-333333333333",
      organizationId: ORGANIZATION,
      name: "Accounting",
      url: "https://hooks.example.test/accounting",
      eventTypes: ["reservation.created"],
      createdAt: new Date("2026-10-07T10:00:00Z"),
      health: "unused",
      lastDeliveredAt: null,
      queued: 0,
      openFailures: 0,
    },
  ],
});

const failures: FailedOperationRecord[] = [
  {
    id: "ff111111-1111-4111-8111-111111111111",
    propertyId: PROPERTY,
    endpointId: "e1111111-1111-4111-8111-111111111111",
    endpointName: "Channel manager",
    operation: "stay.checked_in",
    error: "http_error",
    status: "retrying",
    attempts: 3,
    nextAttemptAt: new Date(Date.now() + 30 * 60_000),
    due: false,
    lastAttemptAt: new Date("2026-10-07T12:00:00Z"),
    lastStatusCode: 503,
    lastResponseExcerpt: "upstream unavailable",
  },
  {
    id: "ff222222-2222-4222-8222-222222222222",
    propertyId: PROPERTY,
    endpointId: "e1111111-1111-4111-8111-111111111111",
    endpointName: "Channel manager",
    operation: "folio.line_posted",
    error: "timeout",
    status: "failed",
    attempts: 6,
    nextAttemptAt: null,
    due: false,
    lastAttemptAt: new Date("2026-10-07T12:30:00Z"),
    lastStatusCode: null,
    lastResponseExcerpt: null,
  },
];

function renderView(
  locale: SupportedLocale,
  options: {
    view?: EndpointsView;
    failedOperations?: FailedOperationRecord[];
    mayActOnFailures?: boolean;
  } = {},
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <IntegrationsView
        endpoints={options.view ?? endpoints(true)}
        failedOperations={options.failedOperations ?? failures}
        locale={locale}
        mayActOnFailures={options.mayActOnFailures ?? true}
        propertyId={PROPERTY}
      />
    </NextIntlClientProvider>,
  );
}

describe("IntegrationsView", () => {
  afterEach(cleanup);

  it("INT-S1-13: shows each endpoint with how it is doing, in words as well as colour", () => {
    renderView("en");

    const cards = screen.getAllByTestId("webhook-endpoint");
    expect(cards).toHaveLength(3);
    expect(within(cards[0]!).getByText("Failing")).toBeInTheDocument();
    expect(within(cards[1]!).getByText("Delivering")).toBeInTheDocument();
    expect(within(cards[2]!).getByText("No delivery yet")).toBeInTheDocument();
    expect(
      within(cards[0]!).getByText("https://hooks.example.test/channel-manager"),
    ).toBeInTheDocument();
    expect(
      within(cards[2]!).getByText("Nothing delivered yet"),
    ).toBeInTheDocument();
  });

  it("INT-S1-04: shows a failed delivery with what happened, the answer, the attempts and the next attempt", () => {
    renderView("en");

    const [retrying, stopped] = screen.getAllByTestId("failed-operation");
    expect(
      within(retrying!).getByText("A guest checks in"),
    ).toBeInTheDocument();
    expect(
      within(retrying!).getByText("The receiver answered with an error"),
    ).toBeInTheDocument();
    expect(within(retrying!).getByText("HTTP 503")).toBeInTheDocument();
    expect(
      within(retrying!).getByText("It said: upstream unavailable"),
    ).toBeInTheDocument();
    expect(within(retrying!).getByText("3")).toBeInTheDocument();
    expect(within(retrying!).getByText("Retrying")).toBeInTheDocument();

    expect(
      within(stopped!).getByText("The receiver did not answer in 10 seconds"),
    ).toBeInTheDocument();
    expect(within(stopped!).getByText("Stopped")).toBeInTheDocument();
    expect(within(stopped!).getByText("No more attempts")).toBeInTheDocument();
  });

  it("INT-S1-06: a retrying failure offers Retry and Stop retrying, and a stopped one offers Retry and Mark resolved", () => {
    renderView("en");

    const [retrying, stopped] = screen.getAllByTestId("failed-operation");
    expect(
      within(retrying!).getByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();
    expect(
      within(retrying!).getByRole("button", { name: "Stop retrying" }),
    ).toBeInTheDocument();
    expect(
      within(retrying!).queryByRole("button", { name: "Mark resolved" }),
    ).toBeNull();

    expect(
      within(stopped!).getByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();
    expect(
      within(stopped!).getByRole("button", { name: "Mark resolved" }),
    ).toBeInTheDocument();
    expect(
      within(stopped!).queryByRole("button", { name: "Stop retrying" }),
    ).toBeNull();
  });

  it("INT-S1-07: someone who may not manage sees the failures and the endpoints and no command", () => {
    renderView("en", { view: endpoints(false), mayActOnFailures: false });

    expect(screen.getAllByTestId("failed-operation")).toHaveLength(2);
    expect(screen.getAllByTestId("webhook-endpoint")).toHaveLength(3);
    for (const name of [
      "Retry",
      "Stop retrying",
      "Mark resolved",
      "Send test event",
      "Remove",
      "Add endpoint",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(
      screen.getByText(/Adding, testing and removing them needs/),
    ).toBeInTheDocument();
  });

  it("INT-S1-58: a manager at the Property but not across the Organization may retry and cannot add", () => {
    renderView("en", { view: endpoints(false), mayActOnFailures: true });

    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Add endpoint" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Send test event" }),
    ).toBeNull();
  });

  it("INT-S1-12: says nothing has failed when nothing has", () => {
    renderView("en", { failedOperations: [] });

    expect(
      screen.getByText(
        "Nothing has failed. Every delivery has arrived or is on its way.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId("failed-operation")).toHaveLength(0);
  });

  it("INT-S1-59: with no endpoint, a manager is invited to add one and a viewer is told there is none", () => {
    renderView("en", {
      view: { endpoints: [], mayManage: true },
      failedOperations: [],
    });
    expect(screen.getByText("No webhook endpoint yet")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Add endpoint" }),
    ).toHaveLength(1);
    cleanup();

    renderView("en", {
      view: { endpoints: [], mayManage: false },
      failedOperations: [],
    });
    expect(
      screen.getByText(
        "No webhook endpoint is registered for this Organization.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add endpoint" })).toBeNull();
  });

  it("INT-S1-14: renders in Turkish", () => {
    renderView("tr");

    expect(screen.getAllByText("Ulaşmayan gönderimler").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("Webhook uç noktaları")).toBeInTheDocument();
    expect(
      within(screen.getAllByTestId("failed-operation")[0]!).getByText(
        "Alıcı hata ile yanıt verdi",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Yeniden dene" }).length,
    ).toBeGreaterThan(0);
  });

  it("INT-S1-14: renders in Arabic", () => {
    renderView("ar");

    expect(screen.getAllByText("عمليات إرسال لم تصل").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("نقاط استقبال الويب هوك")).toBeInTheDocument();
    expect(
      within(screen.getAllByTestId("failed-operation")[0]!).getByText(
        "ردّ المستقبِل بخطأ",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "إعادة المحاولة" }).length,
    ).toBeGreaterThan(0);
  });
});

describe("the screen's own list of events and failures", () => {
  it("INT-S1-26: is the module's, so a new event cannot reach the database and not the screen", () => {
    expect([...WEBHOOK_EVENT_TYPES]).toEqual([...MODULE_EVENT_TYPES]);
  });

  it("INT-S1-14: every event and every failure code has words in all three languages", () => {
    const codes: DeliveryFailure[] = [...DELIVERY_FAILURES];
    for (const locale of ["en", "tr", "ar"] as const) {
      const words = messages[locale].integrations;
      for (const eventType of WEBHOOK_EVENT_TYPES) {
        expect(
          words.events[eventKey(eventType)],
          `${locale} ${eventType}`,
        ).toBeTruthy();
      }
      for (const code of codes) {
        expect(words.failures[code], `${locale} ${code}`).toBeTruthy();
      }
    }
  });
});
