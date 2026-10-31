/**
 * Handing a Guest the Portal, as the booking's sheet draws it (GP-S2-11,
 * GP-S2-12, GP-S2-09).
 *
 * The database decides who may invite and what each standing is; the module's
 * integration suite proves it. This proves the screen's part: what each
 * standing offers, that the common act is one click and shows the link with a
 * copy button and a QR code, that a role which may not invite sees nothing,
 * and that every refusal is said in the reader's words rather than lost.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import { withOverlay } from "../../apps/operator-workspace/src/words/overlay";
import { dormitoryWords } from "../../apps/operator-workspace/src/words/dormitory";
import type { SupportedLocale } from "../../packages/i18n/src";
import type { PortalInvitationOverview } from "../../packages/ranza/stays/src";

const inviteToPortal = vi.fn();
const withdrawPortalInvitation = vi.fn();
vi.mock(
  "../../apps/operator-workspace/src/server/portal-invitation-actions",
  () => ({
    inviteToPortal: (...args: unknown[]) => inviteToPortal(...args),
    withdrawPortalInvitation: (...args: unknown[]) =>
      withdrawPortalInvitation(...args),
  }),
);

const { PortalInvitationSection } =
  await import("../../apps/operator-workspace/src/features/front-office/components/portal-invitation-section");

const RESERVATION = "e8000000-0000-4000-8000-000000000001";
const LINK = "https://portal.example/invite/" + "A".repeat(43);

// jsdom does not lay anything out, so it has no scrolling to do.
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;

afterEach(() => {
  cleanup();
  scrollIntoView.mockClear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  inviteToPortal.mockReset();
  withdrawPortalInvitation.mockReset();
});

function overview(
  overrides: Partial<PortalInvitationOverview> = {},
): PortalInvitationOverview {
  return {
    guestId: "e8000001-0000-4000-8000-000000000001",
    availability: "available",
    standing: "none",
    expiresAt: null,
    connectedAt: null,
    ...overrides,
  };
}

function read(body: unknown, ok = true) {
  const fetch = vi.fn((_url: string) =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
    }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function show(locale: SupportedLocale = "en", dormitory = false) {
  const catalogue = dormitory
    ? withOverlay(messages[locale], dormitoryWords[locale])
    : messages[locale];
  render(
    <NextIntlClientProvider locale={locale} messages={catalogue}>
      <PortalInvitationSection locale={locale} reservationId={RESERVATION} />
    </NextIntlClientProvider>,
  );
}

const copy = messages.en.portalInvite;

describe("a booking's invitation to the Portal", () => {
  it("reads the one booking opened", async () => {
    const fetch = read({ overview: overview() });
    show();
    expect(
      await screen.findByRole("button", { name: copy.invite }),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      `/api/front-office/portal-invitation?reservation=${RESERVATION}`,
      expect.anything(),
    );
  });

  it("makes the link in one click and shows it with a copy button and a QR code (GP-S2-11)", async () => {
    read({ overview: overview() });
    inviteToPortal.mockResolvedValue({
      status: "issued",
      url: LINK,
      expiresAt: "2026-11-14T10:00:00.000Z",
      replacedEarlier: false,
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    show();

    fireEvent.click(await screen.findByRole("button", { name: copy.invite }));

    expect(await screen.findByDisplayValue(LINK)).toBeVisible();
    expect(inviteToPortal).toHaveBeenCalledWith("en", RESERVATION);
    expect(screen.getByRole("img", { name: copy.qrLabel })).toBeVisible();
    // The result is brought into view, at the foot of a long sheet.
    expect(scrollIntoView).toHaveBeenCalled();
    // The link is not sent from here, and the desk is told so.
    expect(screen.getByText(copy.qrHint)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: copy.copy }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK));
    expect(
      await screen.findByRole("button", { name: copy.copied }),
    ).toBeVisible();
  });

  it("says when a copy was refused instead of looking as if it worked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    read({ overview: overview() });
    inviteToPortal.mockResolvedValue({
      status: "issued",
      url: LINK,
      expiresAt: "2026-11-14T10:00:00.000Z",
      replacedEarlier: false,
    });
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    show();

    fireEvent.click(await screen.findByRole("button", { name: copy.invite }));
    fireEvent.click(await screen.findByRole("button", { name: copy.copy }));

    expect(await screen.findByText(copy.copyFailed)).toBeVisible();
    expect(console.error).toHaveBeenCalledWith(
      "portal_invitation.copy_failed",
      expect.anything(),
    );
  });

  it("offers a new link and a withdrawal while one is waiting, and never shows the old link again (GP-S2-05)", async () => {
    read({
      overview: overview({
        standing: "waiting",
        expiresAt: "2026-11-14T10:00:00.000Z",
      }),
    });
    show();

    expect(
      await screen.findByTestId("portal-invitation-state"),
    ).toHaveTextContent(/Invited/);
    expect(screen.getByText(copy.waitingNote)).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: copy.newLink })).toBeVisible();
    expect(screen.getByRole("button", { name: copy.withdraw })).toBeVisible();
  });

  it("says the earlier link stopped working when a new one replaced it", async () => {
    read({
      overview: overview({
        standing: "waiting",
        expiresAt: "2026-11-14T10:00:00.000Z",
      }),
    });
    inviteToPortal.mockResolvedValue({
      status: "issued",
      url: LINK,
      expiresAt: "2026-11-15T10:00:00.000Z",
      replacedEarlier: true,
    });
    show();

    fireEvent.click(await screen.findByRole("button", { name: copy.newLink }));

    expect(await screen.findByText(new RegExp(copy.replaced))).toBeVisible();
  });

  it("withdraws the link and then offers a fresh invitation", async () => {
    read({
      overview: overview({
        standing: "waiting",
        expiresAt: "2026-11-14T10:00:00.000Z",
      }),
    });
    withdrawPortalInvitation.mockResolvedValue("withdrawn");
    show();

    fireEvent.click(await screen.findByRole("button", { name: copy.withdraw }));

    expect(await screen.findByText(copy.withdrawn)).toBeVisible();
    expect(withdrawPortalInvitation).toHaveBeenCalledWith("en", RESERVATION);
    expect(screen.getByRole("button", { name: copy.invite })).toBeVisible();
    expect(screen.queryByRole("button", { name: copy.withdraw })).toBeNull();
  });

  it("reads a withdrawal that found nothing as a stale page, and refreshes it", async () => {
    const fetch = read({
      overview: overview({
        standing: "waiting",
        expiresAt: "2026-11-14T10:00:00.000Z",
      }),
    });
    withdrawPortalInvitation.mockResolvedValue("nothing_to_withdraw");
    show();

    fireEvent.click(await screen.findByRole("button", { name: copy.withdraw }));

    expect(await screen.findByText(copy.nothingToWithdraw)).toBeVisible();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("offers a new invitation once one expired, and says when it did", async () => {
    read({
      overview: overview({
        standing: "expired",
        expiresAt: "2026-10-01T10:00:00.000Z",
      }),
    });
    show();

    expect(
      await screen.findByTestId("portal-invitation-state"),
    ).toHaveTextContent(/expired/);
    expect(screen.getByRole("button", { name: copy.newLink })).toBeVisible();
    expect(screen.queryByRole("button", { name: copy.withdraw })).toBeNull();
  });

  it("offers nothing once the Guest is connected (GP-S2-07)", async () => {
    read({
      overview: overview({
        standing: "connected",
        connectedAt: "2026-10-20T10:00:00.000Z",
      }),
    });
    show();

    expect(
      await screen.findByTestId("portal-invitation-state"),
    ).toHaveTextContent(/Connected on/);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("draws nothing for a role that may not invite, nor for a booking with no Guest (GP-S2-12)", async () => {
    const fetch = read({
      overview: overview({ availability: "not_permitted" }),
    });
    show();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(copy.title)).toBeNull();
    cleanup();

    const walkIn = read({ overview: null });
    show();
    await waitFor(() => expect(walkIn).toHaveBeenCalled());
    expect(screen.queryByText(copy.title)).toBeNull();
  });

  it("tells a role that could invite that the Portal is off at this Property (GP-S2-09)", async () => {
    read({ overview: overview({ availability: "portal_off" }) });
    show();
    expect(await screen.findByText(copy.portalOff)).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says a workspace that does not know the Portal's address, and makes nothing", async () => {
    read({ overview: overview() });
    inviteToPortal.mockResolvedValue({ status: "no_address" });
    show();

    fireEvent.click(await screen.findByRole("button", { name: copy.invite }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      copy.addressMissing,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("says a refused invitation and re-reads how the Guest stands now", async () => {
    const fetch = read({ overview: overview() });
    inviteToPortal.mockResolvedValue({
      status: "refused",
      reason: "already_connected",
    });
    show();

    fireEvent.click(await screen.findByRole("button", { name: copy.invite }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      copy.alreadyConnected,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("says a failure to make the link, and records the thrown one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    read({ overview: overview() });
    inviteToPortal.mockRejectedValue(new Error("network"));
    show();

    fireEvent.click(await screen.findByRole("button", { name: copy.invite }));

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.failed);
    expect(console.error).toHaveBeenCalledWith(
      "portal_invitation.invite_failed",
      expect.objectContaining({ reservationId: RESERVATION }),
    );
  });

  it("says a failed read, never drawn as nothing to do", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    read(null, false);
    show("tr");
    expect(
      await screen.findByText(messages.tr.portalInvite.unavailable),
    ).toBeVisible();
    expect(console.error).toHaveBeenCalledWith(
      "portal_invitation.read_failed",
      expect.objectContaining({ reservationId: RESERVATION }),
    );
  });

  it("speaks of students in a dormitory and of guests elsewhere", async () => {
    read({ overview: overview() });
    show("en", true);
    expect(
      await screen.findByText(dormitoryWords.en.portalInvite!.title!),
    ).toBeVisible();
    expect(screen.queryByText(copy.title)).toBeNull();
  });
});
