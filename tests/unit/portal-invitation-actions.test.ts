/**
 * What the desk's invitation buttons become (RANZ-87).
 *
 * The integration suite proves the module against a real database and pgTAP
 * proves each refusal. This proves the one hop neither reaches: the server
 * action that turns the module's answers into the outcome a screen words,
 * names the Portal in the link, asks for the address before it makes
 * anything, and records the failures nobody expected, never the refusals,
 * which are answers rather than incidents.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invite = vi.fn();
const withdraw = vi.fn();
let portalHost: string | null = "https://portal.example";

vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  requireViewer: async () => ({ userId: VIEWER }),
}));
vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({ stays: { invite, withdraw } }),
  portalOrigin: () => portalHost,
}));

const VIEWER = "ee000001-0000-4000-8000-000000000001";
const RESERVATION = "ee000002-0000-4000-8000-000000000001";
const TOKEN = "T".repeat(43);

const actions =
  await import("../../apps/operator-workspace/src/server/portal-invitation-actions");
const { PortalInvitationRefusedError } =
  await import("../../packages/ranza/stays/src");

beforeEach(() => {
  portalHost = "https://portal.example";
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  invite.mockReset();
  withdraw.mockReset();
});

describe("making a link", () => {
  it("names the Portal and the token, and nothing of the locale", async () => {
    invite.mockResolvedValue({
      token: TOKEN,
      expiresAt: "2026-11-14T10:00:00.000Z",
      replacedEarlier: true,
    });

    await expect(actions.inviteToPortal("ar", RESERVATION)).resolves.toEqual({
      status: "issued",
      url: `https://portal.example/invite/${TOKEN}`,
      expiresAt: "2026-11-14T10:00:00.000Z",
      replacedEarlier: true,
    });
    expect(invite).toHaveBeenCalledWith(VIEWER, RESERVATION);
  });

  it("does not make a link when the Portal's address is unknown, so none is withdrawn for nothing", async () => {
    portalHost = null;

    await expect(actions.inviteToPortal("en", RESERVATION)).resolves.toEqual({
      status: "no_address",
    });
    expect(invite).not.toHaveBeenCalled();
  });

  it.each(["not_allowed", "already_connected"] as const)(
    "answers the module's refusal %s as an outcome, without recording it as a fault",
    async (reason) => {
      invite.mockRejectedValue(new PortalInvitationRefusedError(reason));

      await expect(actions.inviteToPortal("en", RESERVATION)).resolves.toEqual({
        status: "refused",
        reason,
      });
      expect(console.error).not.toHaveBeenCalled();
    },
  );

  it("records a fault with the booking and the viewer, never the token", async () => {
    invite.mockRejectedValue(new Error("connection lost"));

    await expect(actions.inviteToPortal("en", RESERVATION)).resolves.toEqual({
      status: "failed",
    });
    expect(console.error).toHaveBeenCalledWith(
      "portal_invitation.invite_failed",
      { reservationId: RESERVATION, userId: VIEWER },
      expect.any(Error),
    );
  });

  it("refuses a booking that is not an id and a language that does not exist", async () => {
    await expect(actions.inviteToPortal("en", "not-an-id")).resolves.toEqual({
      status: "failed",
    });
    await expect(actions.inviteToPortal("xx", RESERVATION)).resolves.toEqual({
      status: "failed",
    });
    expect(invite).not.toHaveBeenCalled();
  });
});

describe("withdrawing a link", () => {
  it("says withdrawn, and says when there was nothing live to withdraw", async () => {
    withdraw.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      actions.withdrawPortalInvitation("en", RESERVATION),
    ).resolves.toBe("withdrawn");
    await expect(
      actions.withdrawPortalInvitation("en", RESERVATION),
    ).resolves.toBe("nothing_to_withdraw");
  });

  it("answers a refusal as refused and a fault as failed, recording only the fault", async () => {
    withdraw.mockRejectedValueOnce(
      new PortalInvitationRefusedError("not_allowed"),
    );
    await expect(
      actions.withdrawPortalInvitation("en", RESERVATION),
    ).resolves.toBe("refused");
    expect(console.error).not.toHaveBeenCalled();

    withdraw.mockRejectedValueOnce(new Error("connection lost"));
    await expect(
      actions.withdrawPortalInvitation("en", RESERVATION),
    ).resolves.toBe("failed");
    expect(console.error).toHaveBeenCalledWith(
      "portal_invitation.withdraw_failed",
      { reservationId: RESERVATION, userId: VIEWER },
      expect.any(Error),
    );
  });
});
