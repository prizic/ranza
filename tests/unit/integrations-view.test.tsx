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
  retryAllOperationsAction: vi.fn(),
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
      urlMasked: false,
      lastDeliveredAt: new Date("2026-10-07T11:45:00Z"),
      queued: 2,
      overdue: 0,
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
      urlMasked: false,
      lastDeliveredAt: new Date("2026-10-07T12:00:00Z"),
      queued: 0,
      overdue: 0,
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
      urlMasked: false,
      lastDeliveredAt: null,
      queued: 0,
      overdue: 0,
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
    retryable: true,
    closedAt: null,
    closedBy: null,
    closedReason: null,
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
    retryable: true,
    closedAt: null,
    closedBy: null,
    closedReason: null,
  },
];

const VIEWER = "11111111-1111-4111-8111-111111111111";

const closedFailures: FailedOperationRecord[] = [
  {
    ...failures[0]!,
    id: "ff333333-3333-4333-8333-333333333333",
    status: "resolved",
    nextAttemptAt: null,
    closedAt: new Date("2026-10-07T13:00:00Z"),
    closedBy: null,
    closedReason: "delivered",
  },
  {
    ...failures[1]!,
    id: "ff444444-4444-4444-8444-444444444444",
    status: "cancelled",
    closedAt: new Date("2026-10-07T14:00:00Z"),
    closedBy: VIEWER,
    closedReason: "The receiver was switched off for good",
  },
  {
    ...failures[1]!,
    id: "ff555555-5555-4555-8555-555555555555",
    status: "resolved",
    closedAt: new Date("2026-10-07T15:00:00Z"),
    closedBy: "22222222-2222-4222-8222-222222222222",
    closedReason: "endpoint removed",
  },
];

const HREFS = {
  open: "/en/integrations?property=bb",
  closed: "/en/integrations?property=bb&view=closed",
};

function renderView(
  locale: SupportedLocale,
  options: {
    view?: EndpointsView;
    failedOperations?: FailedOperationRecord[];
    total?: number;
    openTotal?: number;
    mayActOnFailures?: boolean;
    shown?: "open" | "closed";
    page?: number;
    pageSize?: number;
  } = {},
) {
  const records = options.failedOperations ?? failures;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <IntegrationsView
        endpoints={options.view ?? endpoints(true)}
        failures={{ records, total: options.total ?? records.length }}
        hrefs={HREFS}
        locale={locale}
        mayActOnFailures={options.mayActOnFailures ?? true}
        openTotal={options.openTotal ?? failures.length}
        page={options.page ?? 1}
        pageSize={options.pageSize ?? 25}
        propertyId={PROPERTY}
        view={options.shown ?? "open"}
        viewerId={VIEWER}
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
    renderView("en", { failedOperations: [], openTotal: 0 });

    expect(
      screen.getByText("Nothing has failed at this Property."),
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

  it("CONFIGURATION-10: a first setup leads with the endpoints section and no tiles of zero, and any activity brings the tiles back", () => {
    renderView("en", {
      view: { endpoints: [], mayManage: true },
      failedOperations: [],
      openTotal: 0,
    });
    const endpointsSection = document.querySelector(
      '[aria-labelledby="endpoints-heading"]',
    );
    expect(endpointsSection).toHaveClass("order-first");
    expect(
      screen.queryByText(messages.en.integrations.openFailuresCount),
    ).toBeNull();
    expect(
      within(endpointsSection as HTMLElement).getByRole("button", {
        name: "Add endpoint",
      }),
    ).toBeInTheDocument();
    cleanup();

    renderView("en");
    expect(
      document.querySelector('[aria-labelledby="endpoints-heading"]'),
    ).not.toHaveClass("order-first");
    expect(
      screen.getByText(messages.en.integrations.openFailuresCount),
    ).toBeVisible();
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

describe("what a failure says and offers", () => {
  afterEach(cleanup);

  it("INT-S1-70: says what to do next, and keeps what the receiver said behind Technical details", () => {
    renderView("en");

    const [retrying] = screen.getAllByTestId("failed-operation");
    expect(
      within(retrying!).getByText(
        "Look in the receiver's logs for why it refused, then Retry.",
      ),
    ).toBeInTheDocument();
    const details = within(retrying!).getByText("Technical details");
    expect(details.closest("details")).not.toHaveAttribute("open");
    expect(details.closest("details")).toContainElement(
      within(retrying!).getByText("It said: upstream unavailable"),
    );
  });

  it("INT-S1-27: an event that did not match its record has no Retry, and says why", () => {
    renderView("en", {
      failedOperations: [
        {
          ...failures[1]!,
          error: "source_mismatch",
          attempts: 0,
          retryable: false,
          status: "failed",
        },
      ],
    });

    const [refused] = screen.getAllByTestId("failed-operation");
    expect(
      within(refused!).getByText(
        "The event did not match the record it named, so it was not sent",
      ),
    ).toBeInTheDocument();
    expect(
      within(refused!).getByText(
        "Nothing to retry. Mark it resolved once you have looked into it.",
      ),
    ).toBeInTheDocument();
    expect(
      within(refused!).queryByRole("button", { name: "Retry" }),
    ).toBeNull();
    expect(
      within(refused!).getByRole("button", { name: "Mark resolved" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("retry-all")).toBeNull();
  });

  it("INT-S1-71: Retry all is offered to someone who may act, when something has stopped, and to nobody else", () => {
    renderView("en");
    expect(screen.getByTestId("retry-all")).toHaveTextContent(
      "Retry all stopped",
    );
    cleanup();

    renderView("en", { mayActOnFailures: false });
    expect(screen.queryByTestId("retry-all")).toBeNull();
    cleanup();

    renderView("en", { failedOperations: [failures[0]!] });
    expect(screen.queryByTestId("retry-all")).toBeNull();
  });

  it("INT-S1-72: the closed list says when, how and why each was closed, and who in words", () => {
    renderView("en", {
      shown: "closed",
      failedOperations: closedFailures,
      openTotal: 2,
    });

    const [delivered, stopped, removed] =
      screen.getAllByTestId("failed-operation");
    expect(
      within(delivered!).getByText(/Resolved · Automatic/),
    ).toBeInTheDocument();
    expect(
      within(delivered!).getByText("It was delivered."),
    ).toBeInTheDocument();
    expect(within(stopped!).getByText(/Cancelled · You/)).toBeInTheDocument();
    expect(
      within(stopped!).getByText("The receiver was switched off for good"),
    ).toBeInTheDocument();
    expect(
      within(removed!).getByText(/Resolved · A colleague/),
    ).toBeInTheDocument();
    expect(
      within(removed!).getByText("The endpoint was removed."),
    ).toBeInTheDocument();
    // What to do next is for an open failure; and a failure that arrived says
    // nothing of the answer it was finally given, which was a success.
    expect(
      within(delivered!).queryByText(/Look in the receiver's logs/),
    ).toBeNull();
    expect(within(delivered!).queryByText("HTTP 503")).toBeNull();
    expect(within(delivered!).queryByText(/It said/)).toBeNull();
    expect(
      within(stopped!).queryByText(
        /Look in the receiver's logs|Nothing to retry/,
      ),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByTestId("failures-tab-open")).toHaveTextContent(
      "Open (2)",
    );
    expect(screen.getByTestId("failures-tab-closed")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByTestId("failures-tab-open")).toHaveAttribute(
      "href",
      HREFS.open,
    );
  });

  it("INT-S1-72: an empty closed list says no failure was closed, not that nothing failed", () => {
    renderView("en", { shown: "closed", failedOperations: [], openTotal: 2 });
    expect(
      screen.getByText("No failure has been closed at this Property yet."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Nothing has failed at this Property."),
    ).toBeNull();
  });

  it("INT-S1-73: a long list is paged, with where you are and a link each way", () => {
    renderView("en", {
      failedOperations: failures,
      total: 61,
      openTotal: 61,
      page: 2,
      pageSize: 25,
    });
    expect(screen.getByText("26–27 of 61")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Newer" })).toHaveAttribute(
      "href",
      HREFS.open,
    );
    expect(screen.getByRole("link", { name: "Older" })).toHaveAttribute(
      "href",
      `${HREFS.open}&page=3`,
    );
    expect(screen.getByTestId("failures-tab-open")).toHaveTextContent(
      "Open (61)",
    );
  });

  it("INT-S1-73: a list that fits on a page has no pager", () => {
    renderView("en");
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
  });

  it("INT-S1-78: the screen says what can be connected, and that the rest cannot yet", () => {
    renderView("en", { view: { endpoints: [], mayManage: true } });
    expect(screen.getByTestId("integrations-availability")).toHaveTextContent(
      "A webhook is the only integration available today. Channel managers, KBS reporting, e-invoicing and payment providers are not available yet.",
    );
  });

  it("INT-S1-67: an address with something cut from it says so, and offers no way to see it", () => {
    const view = endpoints(false);
    renderView("en", {
      view: {
        ...view,
        endpoints: [
          {
            ...view.endpoints[0]!,
            url: "https://hooks.example.test/channel-manager",
            urlMasked: true,
          },
        ],
      },
    });
    const [card] = screen.getAllByTestId("webhook-endpoint");
    expect(
      within(card!).getByText("https://hooks.example.test/channel-manager?…"),
    ).toBeInTheDocument();
    expect(
      within(card!).getByText("Part of this address is hidden from you."),
    ).toBeInTheDocument();
  });

  it("INT-S1-74: an endpoint with deliveries waiting too long says sending may have stopped", () => {
    const view = endpoints(true);
    renderView("en", {
      view: {
        ...view,
        endpoints: [{ ...view.endpoints[1]!, queued: 3, overdue: 3 }],
      },
    });
    expect(screen.getByTestId("endpoint-overdue")).toHaveTextContent(
      "3 deliveries have waited more than 5 minutes to be sent. If this stays, sending may have stopped.",
    );
    cleanup();
    renderView("en", {
      view: {
        ...view,
        endpoints: [{ ...view.endpoints[1]!, queued: 1, overdue: 1 }],
      },
    });
    expect(screen.getByTestId("endpoint-overdue")).toHaveTextContent(
      "1 delivery has waited",
    );
    cleanup();
    renderView("en", { view });
    expect(screen.queryByTestId("endpoint-overdue")).toBeNull();
  });

  it.each(["tr", "ar"] as const)(
    "INT-S1-14: the closed list and the pager render in %s",
    (locale) => {
      renderView(locale, {
        shown: "closed",
        failedOperations: closedFailures,
        total: 61,
        openTotal: 2,
      });
      expect(screen.getAllByTestId("failed-operation")).toHaveLength(3);
      expect(
        screen.getByText(messages[locale].integrations.closedFailuresTitle),
      ).toBeInTheDocument();
    },
  );
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
        expect(words.failureAdvice[code], `${locale} ${code}`).toBeTruthy();
      }
    }
  });
});
