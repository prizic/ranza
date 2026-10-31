/**
 * A booking's student particulars, as the sheet shows them (PA-S1-05).
 *
 * The integration suite proves who the module hands them to; the policy is
 * pgTAP's. This proves the screen's part: they are read for the one booking
 * opened, drawn in the reader's words, absent when the answer is none, and a
 * failed read is said rather than drawn as none.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

describe("a booking's identity document on its sheet (PA-S2-*)", () => {
  const P = messages.en.particulars;
  const STORED = {
    dateOfBirth: null,
    institution: "ODTÜ",
    studyYear: null,
    guardianName: null,
    guardianPhone: null,
    emergencyName: null,
    emergencyPhone: null,
    nationality: "DE",
    documentType: "passport",
    documentLastFour: "4567",
  };

  /** Answers the read with the stored particulars and the reveal as given. */
  function answerBoth(reveal: { ok: boolean; body?: unknown }) {
    const fetch = vi.fn((url: string, init?: { method?: string }) =>
      Promise.resolve(
        init?.method === "POST"
          ? {
              ok: reveal.ok,
              status: reveal.ok ? 200 : 500,
              json: async () => reveal.body,
            }
          : {
              ok: true,
              status: 200,
              json: async () => ({ particulars: STORED }),
            },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("shows the nationality by name and the document masked to its last four, asking for nothing more", async () => {
    const fetch = answerBoth({ ok: true });
    show();

    expect(await screen.findByText("Germany")).toBeVisible();
    expect(screen.getByText(P.documentTypes.passport)).toBeVisible();
    expect(screen.getByText("\u2022\u2022\u2022\u2022 4567")).toBeVisible();
    expect(screen.queryByText("U1234567")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shows the whole number on one press, says that was recorded, and hides it again", async () => {
    const fetch = answerBoth({
      ok: true,
      body: {
        document: { documentType: "passport", documentNumber: "U1234567" },
      },
    });
    show();

    fireEvent.click(
      await screen.findByRole("button", { name: P.documentShow }),
    );
    expect(await screen.findByText("U1234567")).toBeVisible();
    expect(screen.getByText(P.documentRecorded)).toBeVisible();
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/front-office/guest-identity-document?reservation=${RESERVATION}`,
      { method: "POST" },
    );

    fireEvent.click(screen.getByRole("button", { name: P.documentHide }));
    expect(screen.queryByText("U1234567")).toBeNull();
    expect(screen.getByText("\u2022\u2022\u2022\u2022 4567")).toBeVisible();
  });

  it("says a number that could not be shown, in the reader's words, and keeps it masked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    answerBoth({ ok: false });
    show("ar");

    fireEvent.click(
      await screen.findByRole("button", {
        name: messages.ar.particulars.documentShow,
      }),
    );
    expect(
      await screen.findByText(messages.ar.particulars.documentRevealFailed),
    ).toBeVisible();
    expect(console.error).toHaveBeenCalledWith(
      "guest_identity_document.reveal_failed",
      expect.objectContaining({ reservationId: RESERVATION }),
    );
    expect(screen.queryByText("U1234567")).toBeNull();
  });

  it("draws no document row for a booking with none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            particulars: {
              ...STORED,
              nationality: null,
              documentType: null,
              documentLastFour: null,
            },
          }),
        }),
      ),
    );
    show();
    expect(await screen.findByText("ODTÜ")).toBeVisible();
    expect(screen.queryByText(P.documentType)).toBeNull();
    expect(screen.queryByText(P.nationality)).toBeNull();
  });
});
