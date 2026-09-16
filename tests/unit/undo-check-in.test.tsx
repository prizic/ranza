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
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { REVERSAL_REASON } from "../../packages/ranza/reservations/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import type { SupportedLocale } from "../../packages/i18n/src";

// The server action, which this component only calls. Reaching it would drag
// in the composition root, a database connection and Next's request context to
// assert something about a label.
vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  reverseCheckIn: vi.fn(),
}));

const { UndoCheckInDialog } =
  await import("../../apps/operator-workspace/src/features/front-office/components/undo-check-in-dialog");

/** U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL ISOLATE. */
const OPEN = "⁨";
const CLOSE = "⁩";

/** A name that is both scripts and a bracket — the case that misreads. */
const GUEST = "Ada Lovelace (VIP)";

function open(locale: SupportedLocale) {
  // Between renders as well as between tests: these ask the same question in
  // three languages, and two of the same button in one document answers none
  // of them.
  cleanup();
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <UndoCheckInDialog
        guestName={GUEST}
        locale={locale}
        stayId="d9000005-0000-4000-8000-000000000001"
        unitName="101"
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

    const reason = await screen.findByLabelText("Reason");
    // The component restates these rather than importing them, because that
    // module's entry point would bring Prisma into the browser bundle with it.
    // This is what makes the restatement safe.
    expect(reason).toHaveAttribute("maxLength", String(REVERSAL_REASON.max));
    expect(reason).toHaveAttribute("minLength", String(REVERSAL_REASON.min));
    expect(reason).toBeRequired();
  });
});
