import "server-only";
import { InvitedUserLinkError } from "@ranza/auth";
import type { InvitationLink, InvitationLinkState } from "@ranza/staff";
import { FORGET_PROPERTY } from "../lib/property-choice";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * The link an invited colleague opens, and what happens behind it (PEOPLE-01).
 *
 * The invitation already made the person a Ranza user with an active
 * membership (SP-S1-01); what they lack is a way in. This is the one place a
 * login is created for such a person, and it is created through the same
 * sign-up route `db:seed:dev` uses (ADR 0005) — not in SQL — and then tied to
 * the invited user by the auth module's `linkInvitedUser`, which refuses any
 * account that does not carry that user's own address.
 *
 * The token is the authentication. Everything here proves the caller holds a
 * live one before it creates a credential, and an address that is not the one
 * the invitation names can never be put in: the address comes from the
 * invitation, not from the form.
 */

/** Why a link cannot be used, or why using it failed, as the page words it. */
export type InvitationRefusal =
  | "unknown"
  | "expired"
  | "accepted"
  | "withdrawn"
  | "membership_revoked"
  | "other_account"
  | "account_exists"
  | "weak_password"
  | "throttled"
  | "invalid"
  | "unavailable";

/** The reasons a link cannot be opened at all, each worded on its own. */
export type DeadLink = Extract<
  InvitationRefusal,
  | "unknown"
  | "expired"
  | "accepted"
  | "withdrawn"
  | "membership_revoked"
  | "other_account"
>;

/** What the page behind a link shows. */
export type InvitationPage =
  | { kind: "refused"; reason: DeadLink }
  | {
      kind: "open";
      /** How the person gets in: choose a password, sign in, or just accept. */
      mode: "set_password" | "sign_in" | "accept";
      email: string;
      organizationName: string;
      roleKey: string;
      roleScopeId: string;
      roleName: string;
    };

const TOKEN_MAX_LENGTH = 200;
const NAME_MAX_LENGTH = 80;
const PASSWORD_MAX_LENGTH = 128;

const LINK_STATE_REFUSAL: Record<
  Exclude<InvitationLinkState, "pending">,
  DeadLink
> = {
  accepted: "accepted",
  withdrawn: "withdrawn",
  expired: "expired",
  membership_revoked: "membership_revoked",
};

function plausibleToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    token.length > 0 &&
    token.length <= TOKEN_MAX_LENGTH
  );
}

/** The page for a token, read without consuming it. */
export async function readInvitationPage(
  token: string,
): Promise<InvitationPage> {
  if (!plausibleToken(token)) return { kind: "refused", reason: "unknown" };

  const link = await getComposition().staff.invitationState(token);
  if (!link) return { kind: "refused", reason: "unknown" };
  if (link.state !== "pending") {
    return { kind: "refused", reason: LINK_STATE_REFUSAL[link.state] };
  }

  const viewer = await currentViewer();
  if (viewer && viewer.userId !== link.userId) {
    return { kind: "refused", reason: "other_account" };
  }

  return {
    kind: "open",
    mode: viewer ? "accept" : link.hasLogin ? "sign_in" : "set_password",
    email: link.email,
    organizationName: link.organizationName,
    roleKey: link.roleKey,
    roleScopeId: link.roleScopeId,
    roleName: link.roleName,
  };
}

export type AcceptResult =
  { ok: true } | { ok: false; reason: InvitationRefusal };

const STATUS: Record<InvitationRefusal, number> = {
  unknown: 404,
  expired: 410,
  accepted: 410,
  withdrawn: 410,
  membership_revoked: 410,
  other_account: 409,
  account_exists: 409,
  weak_password: 422,
  throttled: 429,
  invalid: 400,
  unavailable: 500,
};

function refusal(reason: InvitationRefusal): Response {
  return Response.json({ ok: false, reason } satisfies AcceptResult, {
    status: STATUS[reason],
  });
}

interface AcceptBody {
  token: string;
  password: string | null;
  name: string;
}

async function readBody(request: Request): Promise<AcceptBody | null> {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) return null;
  const { token, password, name } = body as Record<string, unknown>;
  if (!plausibleToken(token)) return null;
  if (
    password !== undefined &&
    (typeof password !== "string" || password.length > PASSWORD_MAX_LENGTH)
  ) {
    return null;
  }
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (cleanName.length > NAME_MAX_LENGTH) return null;
  return { token, password: password ?? null, name: cleanName };
}

/**
 * The first part of an address, for somebody who gave no name: a login needs
 * one, and nothing in an invitation knows what to call the person.
 */
function nameFor(name: string, email: string): string {
  return name || (email.split("@")[0] ?? email);
}

/**
 * Better Auth's answer to a sign-up, as a refusal where it is one.
 *
 * A rate limit and a password it will not take are answers the page can act on;
 * a duplicate address means somebody already holds an account that is not
 * linked to this invitation. Anything else is a fault and is reported.
 */
async function signUpRefusal(
  response: Response,
): Promise<InvitationRefusal | null> {
  if (response.ok) return null;
  if (response.status === 429) return "throttled";
  const body: unknown = await response.json().catch(() => null);
  const code =
    typeof body === "object" && body !== null && "code" in body
      ? String((body as { code: unknown }).code)
      : "";
  if (code.startsWith("PASSWORD_TOO_")) return "weak_password";
  if (code.startsWith("USER_ALREADY_EXISTS")) return "account_exists";
  console.error("staff.invitation_sign_up_refused", response.status, code);
  return "unavailable";
}

/**
 * Creates the login for an invited person, or accepts for somebody who already
 * has one, and answers with the session when there is a new one to hand over.
 *
 * Sign-up goes through Better Auth's own route handler rather than its API, so
 * the shared rate limit that guards sign-in and sign-up guards this too: a
 * token cannot be tried faster than a password can.
 */
export async function acceptInvitation(request: Request): Promise<Response> {
  const body = await readBody(request);
  if (!body) return refusal("invalid");

  const { staff, auth, linkInvitedUser } = getComposition();
  const link = await staff.invitationState(body.token);
  if (!link) return refusal("unknown");
  if (link.state !== "pending") return refusal(LINK_STATE_REFUSAL[link.state]);

  const viewer = await currentViewer();
  if (viewer && viewer.userId !== link.userId) return refusal("other_account");

  if (body.password === null) return acceptForViewer(body.token, link, viewer);
  if (viewer || link.hasLogin) return refusal("account_exists");

  return createLoginAndAccept(request, body, link, { auth, linkInvitedUser });
}

async function acceptForViewer(
  token: string,
  link: InvitationLink,
  viewer: { userId: string } | null,
): Promise<Response> {
  if (!viewer || viewer.userId !== link.userId) return refusal("other_account");
  try {
    await getComposition().staff.accept(token);
  } catch (error) {
    console.error("staff.invitation_accept_failed", link.userId, error);
    return refusal("unavailable");
  }
  return Response.json({ ok: true } satisfies AcceptResult);
}

async function createLoginAndAccept(
  request: Request,
  body: AcceptBody,
  link: InvitationLink,
  {
    auth,
    linkInvitedUser,
  }: Pick<ReturnType<typeof getComposition>, "auth" | "linkInvitedUser">,
): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  headers.delete("cookie");

  const signUp = await auth.handler(
    new Request(new URL("/api/auth/sign-up/email", request.url), {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: link.email,
        password: body.password,
        name: nameFor(body.name, link.email),
      }),
    }),
  );

  const refused = await signUpRefusal(signUp.clone());
  if (refused) return refusal(refused);

  const created: unknown = await signUp
    .clone()
    .json()
    .catch(() => null);
  const subject =
    typeof created === "object" && created !== null && "user" in created
      ? (created as { user?: { id?: unknown } }).user?.id
      : undefined;
  if (typeof subject !== "string") {
    console.error("staff.invitation_sign_up_unreadable", link.userId);
    return refusal("unavailable");
  }

  try {
    await linkInvitedUser({ subject, userId: link.userId });
    await getComposition().staff.accept(body.token);
  } catch (error) {
    if (!(error instanceof InvitedUserLinkError)) {
      console.error("staff.invitation_accept_failed", link.userId, error);
    }
    return refusal("unavailable");
  }

  const reply = Response.json({ ok: true } satisfies AcceptResult);
  for (const cookie of signUp.headers.getSetCookie()) {
    reply.headers.append("set-cookie", cookie);
  }
  reply.headers.append("set-cookie", FORGET_PROPERTY);
  return reply;
}
