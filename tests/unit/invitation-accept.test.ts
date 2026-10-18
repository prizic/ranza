/**
 * What the invitation route answers (PEOPLE-01, SP-S1-54 to SP-S1-56).
 *
 * The module, the database and the browser prove the rest. This proves the step
 * between them that none of those can reach: that the address a login is made
 * for is the invitation's and never the request's, that every refusal from the
 * sign-up route becomes a reason the page can word, that the shared rate limit
 * is the one answering (so the route is limited as sign-in is), and that no
 * session is handed over unless the login was tied and the invitation accepted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));

const invitationState = vi.fn();
const accept = vi.fn();
const handler = vi.fn();
const linkInvitedUser = vi.fn();
const currentViewer = vi.fn();

vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({
    staff: { invitationState, accept },
    auth: { handler },
    linkInvitedUser,
  }),
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  currentViewer: () => currentViewer(),
}));

const { acceptInvitation, readInvitationPage } =
  await import("../../apps/operator-workspace/src/server/invitation");
const { InvitedUserLinkError } = await import("../../packages/auth/src");

const INVITED = "ee000001-0000-4000-8000-000000000001";
const link = {
  state: "pending",
  userId: INVITED,
  email: "invited@hotel.test",
  organizationName: "Hotel",
  roleKey: "front_desk",
  roleScopeId: "00000000-0000-0000-0000-000000000000",
  roleName: "Front desk",
  hasLogin: false,
};

function post(body: unknown): Request {
  return new Request("http://localhost/api/staff-invitation/accept", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

function signedUp(subject = "subject-1"): Response {
  const response = Response.json({ user: { id: subject } });
  response.headers.append("set-cookie", "session=abc; Path=/");
  return response;
}

beforeEach(() => {
  for (const spy of [
    invitationState,
    accept,
    handler,
    linkInvitedUser,
    currentViewer,
  ]) {
    spy.mockReset();
  }
  invitationState.mockResolvedValue(link);
  currentViewer.mockResolvedValue(null);
  accept.mockResolvedValue({ organizationId: "o", userId: INVITED });
  linkInvitedUser.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("choosing a password from the link", () => {
  it("SP-S1-54: signs up with the invitation's address, ties the login to the invited user, accepts, and hands over the session", async () => {
    handler.mockResolvedValue(signedUp());
    const response = await acceptInvitation(
      post({
        token: "t".repeat(43),
        name: "Nadia",
        password: "a-long-enough-password",
        // A crafted request names another address; it is never read.
        email: "victim@hotel.test",
      }),
    );

    expect(response.status).toBe(200);
    const sent = (await (handler.mock.calls[0]![0] as Request).json()) as {
      email: string;
      name: string;
    };
    expect(sent.email).toBe("invited@hotel.test");
    expect(sent.name).toBe("Nadia");
    expect(new URL((handler.mock.calls[0]![0] as Request).url).pathname).toBe(
      "/api/auth/sign-up/email",
    );
    expect(linkInvitedUser).toHaveBeenCalledWith({
      subject: "subject-1",
      userId: INVITED,
    });
    expect(accept).toHaveBeenCalledWith("t".repeat(43));
    expect(response.headers.getSetCookie().join(";")).toContain("session=abc");
  });

  it("SP-S1-54: names the person after their address when they gave no name", async () => {
    handler.mockResolvedValue(signedUp());
    await acceptInvitation(
      post({ token: "t", password: "a-long-enough-password" }),
    );
    const sent = (await (handler.mock.calls[0]![0] as Request).json()) as {
      name: string;
    };
    expect(sent.name).toBe("invited");
  });

  it("SP-S1-54: the shared rate limit answers, and a refusal says so and creates nothing", async () => {
    handler.mockResolvedValue(new Response(null, { status: 429 }));
    const response = await acceptInvitation(
      post({ token: "t", password: "a-long-enough-password" }),
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ ok: false, reason: "throttled" });
    expect(linkInvitedUser).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
  });

  it("SP-S1-54: a password the sign-up will not take is a reason the page can word, and nothing is tied", async () => {
    handler.mockResolvedValue(
      Response.json({ code: "PASSWORD_TOO_SHORT" }, { status: 400 }),
    );
    const response = await acceptInvitation(
      post({ token: "t", password: "short" }),
    );
    expect(await response.json()).toEqual({
      ok: false,
      reason: "weak_password",
    });
    expect(linkInvitedUser).not.toHaveBeenCalled();
  });

  it("SP-S1-56: an address that already has an unlinked account is refused, not taken over", async () => {
    handler.mockResolvedValue(
      Response.json(
        { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
        { status: 422 },
      ),
    );
    const response = await acceptInvitation(
      post({ token: "t", password: "a-long-enough-password" }),
    );
    expect(await response.json()).toEqual({
      ok: false,
      reason: "account_exists",
    });
    expect(linkInvitedUser).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
  });

  it("SP-S1-56: when the link to the user is refused no session is handed over", async () => {
    handler.mockResolvedValue(signedUp());
    linkInvitedUser.mockRejectedValue(new InvitedUserLinkError("has_login"));
    const response = await acceptInvitation(
      post({ token: "t", password: "a-long-enough-password" }),
    );
    expect(response.status).toBe(500);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(accept).not.toHaveBeenCalled();
  });

  it("SP-S1-55: a link that is not pending is refused before any account is made", async () => {
    for (const state of ["expired", "accepted", "withdrawn"]) {
      invitationState.mockResolvedValue({ ...link, state });
      const response = await acceptInvitation(
        post({ token: "t", password: "a-long-enough-password" }),
      );
      expect(await response.json()).toEqual({ ok: false, reason: state });
    }
    invitationState.mockResolvedValue(null);
    const unknown = await acceptInvitation(
      post({ token: "t", password: "a-long-enough-password" }),
    );
    expect(await unknown.json()).toEqual({ ok: false, reason: "unknown" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("SP-S1-54: somebody signed in as another person is refused", async () => {
    currentViewer.mockResolvedValue({ userId: "someone-else" });
    const response = await acceptInvitation(
      post({ token: "t", password: "a-long-enough-password" }),
    );
    expect(await response.json()).toEqual({
      ok: false,
      reason: "other_account",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("SP-S1-54: a body that is not what the page sends is invalid", async () => {
    for (const body of [null, {}, { token: 5 }, { token: "t", password: 5 }]) {
      const response = await acceptInvitation(post(body));
      expect(response.status).toBe(400);
    }
  });
});

describe("accepting as somebody already signed in", () => {
  it("SP-S1-54: the invited person accepts without a password", async () => {
    currentViewer.mockResolvedValue({ userId: INVITED });
    const response = await acceptInvitation(post({ token: "t" }));
    expect(response.status).toBe(200);
    expect(accept).toHaveBeenCalledWith("t");
    expect(handler).not.toHaveBeenCalled();
  });

  it("SP-S1-54: a request with no password and no session accepts nothing", async () => {
    const response = await acceptInvitation(post({ token: "t" }));
    expect(await response.json()).toEqual({
      ok: false,
      reason: "other_account",
    });
    expect(accept).not.toHaveBeenCalled();
  });
});

describe("the page behind the link", () => {
  it("SP-S1-54: offers a password to somebody with no login, a sign-in to one who has, and just accepting to the invited person", async () => {
    expect(await readInvitationPage("t")).toMatchObject({
      kind: "open",
      mode: "set_password",
      email: "invited@hotel.test",
    });
    invitationState.mockResolvedValue({ ...link, hasLogin: true });
    expect(await readInvitationPage("t")).toMatchObject({ mode: "sign_in" });
    currentViewer.mockResolvedValue({ userId: INVITED });
    expect(await readInvitationPage("t")).toMatchObject({ mode: "accept" });
  });

  it("SP-S1-55: says whose it is when somebody else is signed in, and each dead state in its own words", async () => {
    currentViewer.mockResolvedValue({ userId: "someone-else" });
    expect(await readInvitationPage("t")).toEqual({
      kind: "refused",
      reason: "other_account",
    });
    currentViewer.mockResolvedValue(null);
    for (const state of [
      "expired",
      "accepted",
      "withdrawn",
      "membership_revoked",
    ]) {
      invitationState.mockResolvedValue({ ...link, state });
      expect(await readInvitationPage("t")).toEqual({
        kind: "refused",
        reason: state,
      });
    }
    invitationState.mockResolvedValue(null);
    expect(await readInvitationPage("t")).toEqual({
      kind: "refused",
      reason: "unknown",
    });
    expect(await readInvitationPage("x".repeat(500))).toEqual({
      kind: "refused",
      reason: "unknown",
    });
  });
});
