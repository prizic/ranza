import { createHash, randomBytes } from "node:crypto";
import { withOrganizationContext, type PrismaClient } from "@ranza/db";
import {
  PortalInvitationRefusedError,
  type IssuedPortalInvitation,
  type PortalAcceptance,
  type PortalAcceptanceOutcome,
  type PortalInvitationOverview,
  type PortalInvitationStanding,
  type PortalLink,
} from "./contracts";

/**
 * Giving a Guest the Portal: the desk makes a link, the student opens it
 * (RANZ-87, GP-S2-*, GP-S3-*, ADR 0060).
 *
 * All of the rule is in the database. This file makes the token and its digest,
 * asks inside the right request context, and turns a SQLSTATE into a word the
 * desk screen can say. It decides nothing a defect here could get wrong.
 */

const INSUFFICIENT_PRIVILEGE = "42501";
const OBJECT_NOT_IN_PREREQUISITE_STATE = "55000";

/** 32 random bytes, base64url: always 43 characters. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/**
 * The digest the database stores. SHA-256 and not a password hash on purpose:
 * the token is 256 random bits, not something a person chose, so there is
 * nothing for a slow hash to slow down (as the staff invitation, ADR 0053).
 */
function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/*
 * Instants cross the driver as text in UTC. A timestamptz read through a raw
 * query came back shifted by the session's offset, so the database says which
 * instant it means rather than leaving it to the driver to guess.
 */

function raised(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { meta, message } = error as {
    meta?: { driverAdapterError?: { cause?: { code?: unknown } } };
    message?: unknown;
  };
  return (
    meta?.driverAdapterError?.cause?.code === code ||
    (typeof message === "string" && message.includes(code))
  );
}

interface OverviewRow {
  guestId: string;
  mayInvite: boolean;
  holdsPermission: boolean;
  portalOn: boolean;
  standing: PortalInvitationStanding;
  expiresAt: string | null;
  connectedAt: string | null;
}

export function createPortalInvitations(deps: { db: PrismaClient }) {
  /**
   * Where the invitation of a booking's Guest stands, and whether the desk may
   * offer a link. Null when the booking has no Guest the viewer can read.
   *
   * A Staff Member who does not hold the permission reads no invitation rows at
   * all (the policy asks for it), so `standing` is `none` for them and the
   * section draws nothing: the database is what says they may not look.
   */
  async function overview(
    userId: string,
    reservationId: string,
  ): Promise<PortalInvitationOverview | null> {
    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<OverviewRow[]>`
        select
          guest.id                                   as "guestId",
          app.may_invite_to_portal(guest.id)         as "mayInvite",
          app.has_organization_permission(
            guest.organization_id, 'guests.invite_to_portal')
                                                     as "holdsPermission",
          app.can_use_capability_in_organization(
            guest.organization_id, 'front_office', 'portal_stay_overview')
                                                     as "portalOn",
          case
            when latest.status is null then 'none'
            when latest.status = 'pending' and latest.expires_at <= now()
              then 'expired'
            when latest.status = 'pending' then 'waiting'
            when latest.status = 'accepted' then 'connected'
            else 'withdrawn'
          end                                        as "standing",
          to_char(
            case when latest.status = 'pending' then latest.expires_at end
              at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')         as "expiresAt",
          to_char(latest.accepted_at at time zone 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')   as "connectedAt"
        from public.reservations as booking
        join public.guests as guest
          on guest.id = booking.guest_id
         and guest.organization_id = booking.organization_id
        left join lateral (
          select invitation.status, invitation.expires_at, invitation.accepted_at
            from public.guest_portal_invitations as invitation
           where invitation.guest_id = guest.id
           order by (invitation.status = 'accepted') desc, invitation.created_at desc
           limit 1
        ) as latest on true
        where booking.id = ${reservationId}::uuid
      `,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      guestId: row.guestId,
      availability: row.mayInvite
        ? "available"
        : row.holdsPermission && !row.portalOn
          ? "portal_off"
          : "not_permitted",
      standing: row.standing,
      expiresAt: row.expiresAt,
      connectedAt: row.connectedAt,
    };
  }

  /**
   * Makes a link for a booking's Guest, withdrawing the live one.
   *
   * The token is made here and only its digest crosses into the database, so
   * the one place it exists afterwards is the response that shows it.
   */
  async function invite(
    userId: string,
    reservationId: string,
  ): Promise<IssuedPortalInvitation> {
    const token = randomBytes(32).toString("base64url");
    try {
      const rows = await withOrganizationContext(
        deps.db,
        { userId },
        (tx) =>
          tx.$queryRaw<{ expiresAt: string; replaced: string | null }[]>`
            select to_char(invitation.invitation_expires_at at time zone 'UTC',
                           'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "expiresAt",
                   invitation.replaced_invitation_id         as "replaced"
              from app.invite_guest_to_portal(
                     (select guest_id from public.reservations
                       where id = ${reservationId}::uuid),
                     ${digest(token)}) as invitation
          `,
      );
      const issued = rows[0];
      if (!issued) throw new Error("the invitation was not made");
      return {
        token,
        expiresAt: issued.expiresAt,
        replacedEarlier: issued.replaced !== null,
      };
    } catch (error: unknown) {
      if (raised(error, OBJECT_NOT_IN_PREREQUISITE_STATE)) {
        throw new PortalInvitationRefusedError("already_connected");
      }
      if (raised(error, INSUFFICIENT_PRIVILEGE)) {
        throw new PortalInvitationRefusedError("not_allowed");
      }
      throw error;
    }
  }

  /** Withdraws the live link of a booking's Guest. False when there was none. */
  async function withdraw(
    userId: string,
    reservationId: string,
  ): Promise<boolean> {
    try {
      const rows = await withOrganizationContext(
        deps.db,
        { userId },
        (tx) =>
          tx.$queryRaw<{ withdrawn: string | null }[]>`
            select app.withdraw_portal_invitation(
                     (select guest_id from public.reservations
                       where id = ${reservationId}::uuid)) as "withdrawn"
          `,
      );
      return rows[0]?.withdrawn != null;
    } catch (error: unknown) {
      if (raised(error, INSUFFICIENT_PRIVILEGE)) {
        throw new PortalInvitationRefusedError("not_allowed");
      }
      throw error;
    }
  }

  /**
   * What the page behind a link may say. Runs without a request context: the
   * person holding the link cannot sign in yet, and the argument is the digest
   * of a 256-bit token, so nobody can name a row they do not hold. Null is a
   * link that never existed, which a mistyped one looks like.
   */
  async function link(token: string): Promise<PortalLink | null> {
    if (!TOKEN_SHAPE.test(token)) return null;
    const rows = await deps.db.$queryRaw<
      {
        state: PortalLink["state"];
        organizationName: string;
        guestName: string;
        guestEmail: string | null;
      }[]
    >`
      select state,
             organization_name as "organizationName",
             guest_name        as "guestName",
             guest_email       as "guestEmail"
        from app.portal_invitation_state(${digest(token)})
    `;
    return rows[0] ?? null;
  }

  /**
   * Accepts a link as the signed-in user. A refusal is an outcome, not an
   * exception: the holder of a live token may be told why it does not work. A
   * string that cannot be a token is `unknown` without asking the database.
   */
  async function accept(
    userId: string,
    token: string,
  ): Promise<PortalAcceptance> {
    if (!TOKEN_SHAPE.test(token)) return { outcome: "unknown", linkedStays: 0 };
    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<
          { outcome: PortalAcceptanceOutcome; linkedStays: number }[]
        >`
        select outcome, linked_stays as "linkedStays"
          from app.accept_portal_invitation(${digest(token)})
      `,
    );
    const result = rows[0];
    if (!result)
      throw new Error("accepting a Portal invitation returned nothing");
    return result;
  }

  return { overview, invite, withdraw, link, accept };
}
