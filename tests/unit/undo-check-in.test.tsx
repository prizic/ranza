/**
 * The name of the button that takes a check-in back.
 *
 * A column of buttons that all say "Undo check-in" is one action repeated to a
 * screen reader, so the Guest is in the accessible name — which makes the name
 * a sentence with data dropped into it, in three languages, one of them
 * right-to-left.
 *
 * That is what these assert: the name carries the Guest, and the Guest arrives
 * wrapped in bidirectional isolates. Without them the bidirectional algorithm
 * reorders a Latin name against Arabic words around it, and a name ending in a
 * bracket or a number lands with its punctuation at the wrong end — the label
 * reads as a different name, which for an action that withdraws somebody's
 * arrival is the worst place for it to happen.
 *
 * `<bdi>` does the same job in the markup and needs no test: it is an element,
 * and it is either there or it is not. An `aria-label` is a string, and a
 * string is where the isolates get dropped.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { REVERSAL_REASON } from "../../packages/ranza/reservations/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import type { SupportedLocale } from "../../packages/i18n/src";
import type { UndoWays } from "../../apps/operator-workspace/src/features/front-office/undo-ways";

// The server action, which this component only calls. Reaching it would drag
// in the composition root, a database connection and Next's request context to
// assert something about a label.
vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  reverseCheckIn: vi.fn(),
}));

vi.mock("../../apps/operator-workspace/node_modules/next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

const { reverseCheckIn } =
  await import("../../apps/operator-workspace/src/server/front-office");
const { UndoCheckInDialog } =
  await import("../../apps/operator-workspace/src/features/front-office/components/undo-check-in-dialog");

/** U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL ISOLATE. */
const OPEN = "⁨";
const CLOSE = "⁩";

/** A name that is both scripts and a bracket — the case that misreads. */
const GUEST = "Ada Lovelace (VIP)";

const NO_WAYS: UndoWays = { folioHref: null, departuresHref: null };

function open(locale: SupportedLocale, ways: UndoWays = NO_WAYS) {
  // Between renders as well as between tests: these ask the same question in
  // three languages, and two of the same button in one document answers none
  // of them.
  cleanup();
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <UndoCheckInDialog
        guestName={GUEST}
        locale={locale}
        reservationId="d9000005-0000-4000-8000-000000000002"
        stayId="d9000005-0000-4000-8000-000000000001"
        unitName="101"
        ways={ways}
      />
    </NextIntlClientProvider>,
  );
  return screen.getByRole("button");
}

describe("the undo check-in trigger", () => {
  it("names the Guest, isolated, in Arabic", () => {
    expect(open("ar")).toHaveAttribute(
      "aria-label",
      `التراجع عن تسجيل الوصول لـ ${OPEN}${GUEST}${CLOSE}`,
    );
  });

  it("isolates it in the left-to-right languages too", () => {
    // Not an Arabic problem. A Turkish label and an Arabic name is the same
    // sentence with the directions swapped, and a label is not the place to
    // decide which way round today's Guest is.
    for (const locale of ["tr", "en"] as const) {
      expect(open(locale).getAttribute("aria-label")).toContain(
        `${OPEN}${GUEST}${CLOSE}`,
      );
    }
  });
});

describe("the reason field", () => {
  it("stops typing where the module stops accepting", async () => {
    open("en").click();

    const reason = await screen.findByLabelText("Why is it being undone?");
    // The component restates these rather than importing them, because that
    // module's entry point would bring Prisma into the browser bundle with it.
    // This is what makes the restatement safe.
    expect(reason).toHaveAttribute("maxLength", String(REVERSAL_REASON.max));
    expect(reason).toHaveAttribute("minLength", String(REVERSAL_REASON.min));
    expect(reason).toBeRequired();
  });
});

describe("a withdrawal the system refuses leads on (audit 2026-11-07, A-07)", () => {
  const WAYS: UndoWays = {
    folioHref: "/en/finance?property=p1&folio=f1",
    departuresHref: "/en/departures?property=p1",
  };

  async function refused(
    outcome: "charges" | "dayClosed" | "moved",
    ways: UndoWays,
  ) {
    vi.mocked(reverseCheckIn).mockResolvedValue(outcome);
    open("en", ways).click();
    fireEvent.change(await screen.findByLabelText("Why is it being undone?"), {
      target: { value: "Wrong room" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Undo check-in" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
  }

  it("A-07: posted charges lead to the Folio", async () => {
    await refused("charges", WAYS);
    expect(
      screen.getByRole("link", { name: "Open folio" }).getAttribute("href"),
    ).toBe(WAYS.folioHref);
  });

  it("A-07: a closed day or a move leads to Departures", async () => {
    await refused("dayClosed", WAYS);
    expect(
      screen
        .getByRole("link", { name: "Check out (opens Departures)" })
        .getAttribute("href"),
    ).toBe(WAYS.departuresHref);
    cleanup();
    await refused("moved", WAYS);
    expect(
      screen.getByRole("link", { name: "Check out (opens Departures)" }),
    ).toBeVisible();
  });

  it("A-07: no link to a page the viewer cannot open", async () => {
    await refused("charges", { ...WAYS, folioHref: null });
    expect(screen.queryByRole("link")).toBeNull();
    cleanup();
    await refused("dayClosed", { ...WAYS, departuresHref: null });
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("where a refused withdrawal may lead (A-07)", () => {
  it("A-07: asks the viewer's reach, and leaves out a Stay with no Folio", async () => {
    const { undoWays } =
      await import("../../apps/operator-workspace/src/features/front-office/undo-ways");
    const { REACHES_EVERYTHING } =
      await import("../../apps/operator-workspace/src/features/front-office/reach");
    expect(undoWays("en", "p1", REACHES_EVERYTHING, "f1")).toEqual({
      folioHref: "/en/finance?property=p1&folio=f1",
      departuresHref: "/en/departures?property=p1",
    });
    expect(undoWays("en", "p1", REACHES_EVERYTHING, null).folioHref).toBeNull();
    expect(
      undoWays(
        "en",
        "p1",
        { ...REACHES_EVERYTHING, folio: false, departures: false },
        "f1",
      ),
    ).toEqual({ folioHref: null, departuresHref: null });
  });
});
