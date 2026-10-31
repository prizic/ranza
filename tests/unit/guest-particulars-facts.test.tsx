/**
 * A booking's student particulars, as the sheet shows them (PA-S1-05).
 *
 * The integration suite proves who the module hands them to; the policy is
 * pgTAP's. This proves the screen's part: they are read for the one booking
 * opened, drawn in the reader's words, absent when the answer is none, and a
 * failed read is said rather than drawn as none.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import type { SupportedLocale } from "../../packages/i18n/src";

const { GuestParticularsFacts } =
  await import("../../apps/operator-workspace/src/features/front-office/components/guest-particulars-facts");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const RESERVATION = "e7000000-0000-4000-8000-000000000001";

function answer(response: { ok: boolean; status?: number; body?: unknown }) {
  const fetch = vi.fn((_url: string) =>
    Promise.resolve({
      ok: response.ok,
      status: response.status ?? 200,
      json: async () => response.body,
    }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function show(locale: SupportedLocale = "en") {
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <GuestParticularsFacts locale={locale} reservationId={RESERVATION} />
    </NextIntlClientProvider>,
  );
}

describe("a booking's particulars on its sheet", () => {
  it("reads the one booking opened and shows what is recorded, leaving out what is not", async () => {
    const fetch = answer({
      ok: true,
      body: {
        particulars: {
          dateOfBirth: "2008-03-14",
          institution: "ODTÜ",
          studyYear: 1,
          guardianName: "Ayten Öğrenci",
          guardianPhone: "+90 532 111 11 11",
          emergencyName: null,
          emergencyPhone: null,
        },
      },
    });
    show();

    expect(await screen.findByText("Mar 14, 2008")).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      `/api/front-office/guest-particulars?reservation=${RESERVATION}`,
      expect.anything(),
    );
    expect(screen.getByText("ODTÜ")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "+90 532 111 11 11" }),
    ).toHaveAttribute("href", "tel:+90 532 111 11 11");
    expect(
      screen.queryByText(messages.en.particulars.emergencyName),
    ).toBeNull();
  });

  it("draws nothing when there is nothing the viewer may see", async () => {
    const fetch = answer({ ok: true, body: { particulars: null } });
    show();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(messages.en.particulars.title)).toBeNull();
  });

  it("says a failed read in the reader's words, never as none", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    answer({ ok: false, status: 500 });
    show("tr");
    expect(
      await screen.findByText(messages.tr.particulars.unavailable),
    ).toBeVisible();
    expect(console.error).toHaveBeenCalledWith(
      "guest_particulars.read_failed",
      expect.objectContaining({ reservationId: RESERVATION }),
    );
  });
});
