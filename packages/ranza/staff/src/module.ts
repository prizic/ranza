import { createHash, randomBytes } from "node:crypto";
import { withOrganizationContext } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import { publishWithin } from "@ranza/platform-outbox";
import {
  AlreadyAMemberError,
  INVITATION_LIFETIME_DAYS,
  LastAdministratorError,
  StaffRefusedError,
  UNDO_REVOKE_WINDOW_HOURS,
  type Invited,
  type StaffMember,
} from "./contracts";
import type { StaffDeps } from "./ports";

/**
 * Staff and permissions: who works here, what they may do, and where.
 *
 * Nothing below asks whether the actor is allowed. The statements run inside a
 * request context and the policies answer — ADR 0012, and the same arrangement
 * Reservations uses. What is different here is that the subject of the write is
 * authorization itself, so the usual temptation to "just check first" would be
 * the defect rather than the belt and braces: a check the database does not
 * also make is a check somebody can route around.
 *
 * The one thing this module cannot do is end a session. `ranza_app` is granted
 * nothing on `auth_session` and that is deliberate (ADR 0005). Every command
 * that changes what somebody reaches publishes `staff.reach_changed` in the
 * same transaction, so the fact cannot be lost while the handler that acts on
 * it is still being built (SP-S1-29, SP-S4-01).
 */

/** Every shipped role lives in this scope, which is not an Organization. */
const SHIPPED_SCOPE = "00000000-0000-0000-0000-000000000000";

/** Postgres refuses a statement no policy admits with this. */
const INSUFFICIENT_PRIVILEGE = "42501";

/** Raised by the trigger that keeps an Organization able to add staff. */
const NOT_PERMITTED_BY_STATE = "55000";

/** A unique violation: the pending-invitation index, or the membership key. */
const UNIQUE_VIOLATION = "23505";

/**
 * Whether a failure carries a particular SQLSTATE.
 *
 * Read from the code rather than from a constraint name, so renaming either
 * cannot turn a specific refusal into an unexplained error. Prisma reports a
 * raw-query failure as P2010 and carries the real code inside `meta`; the
 * message is checked too, because the shape of `meta` is Prisma's private
 * arrangement and has changed once already.
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

/**
 * The digest of an invitation token.
 *
 * SHA-256 and not a password hash on purpose: this is a 256-bit random value,
 * not something a person chose, so there is nothing to slow an attacker down
 * about — and the comparison happens on every acceptance.
 */
function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * The one row a statement was written to produce.
 *
 * Not a convenience: an empty result here means the row was written and then
 * hidden by a read policy, which is a defect in the policies rather than an
 * absence, and it should say so loudly rather than carry an undefined onwards.
 */
function only<T>(rows: readonly T[], what: string): T {
  const row = rows[0];
  if (!row) {
    throw new StaffRefusedError(`${what} could not be read back`);
  }
  return row;
}

interface RoleReference {
  /** The role's key. */
  roleKey: string;
  /** Its scope: this Organization, or the shipped scope. Defaults to shipped. */
  roleScopeId?: string;
}

export interface InviteStaffMember extends RoleReference {
  organizationId: string;
  email: string;
  /** `organization_wide` reaches every Property; the default reaches assigned ones. */
  accessScope?: "organization_wide" | "assigned_properties";
  /** May be empty. Reaching nothing is a normal state (SP-S1-06). */
  propertyIds?: readonly string[];
}

export function createStaffModule(deps: StaffDeps) {
  /**
   * Invites somebody, and writes their membership in the same breath.
   *
   * The membership is active immediately and the invitation is only the way to
   * a password. That is the answer to a question the design asked explicitly:
   * a person is a Staff Member because an administrator said so, not because
   * they got round to clicking a link, and an Organization's roster should not
   * be a list of people who have and have not opened their email yet.
   *
   * Everything here is one transaction — the membership, the role, every
   * assignment, the invitation, the event and the audit record — because a
   * membership with half its Properties is worse than no membership at all
   * (SP-S1-02).
   */
  async function invite(
    context: { userId: string },
    input: InviteStaffMember,
  ): Promise<Invited> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      Date.now() + INVITATION_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
    );

    try {
      return await withOrganizationContext(deps.db, context, async (tx) => {
        const userId = only(
          await tx.$queryRawUnsafe<{ id: string }[]>(
            "select app.identify_staff_user($1) as id",
            input.email,
          ),
          "the invited person",
        ).id;

        // No upsert. SP-S1-03 says one person has one membership per
        // Organization, and SP-S1-16 says re-inviting a revoked one reuses the
        // row — which is a different command from inviting somebody, because
        // it undoes a revoke rather than adds a colleague. Letting one
        // statement do both would hide a revoked person being quietly restored
        // inside an action that reads as "add".
        const written = await tx.$executeRawUnsafe(
          `insert into public.organization_memberships
             (organization_id, user_id, role, role_scope_id, access_scope, status)
           values ($1::uuid, $2::uuid, $3, $4::uuid, $5, 'active')
           on conflict (organization_id, user_id) do nothing`,
          input.organizationId,
          userId,
          input.roleKey,
          input.roleScopeId ?? SHIPPED_SCOPE,
          input.accessScope ?? "assigned_properties",
        );
        if (written === 0) {
          throw new AlreadyAMemberError(
            "that person already has a membership in this Organization",
          );
        }

        const membership = only(
          await tx.$queryRawUnsafe<{ id: string }[]>(
            `select id from public.organization_memberships
              where organization_id = $1::uuid and user_id = $2::uuid`,
            input.organizationId,
            userId,
          ),
          "the new membership",
        );

        for (const propertyId of input.propertyIds ?? []) {
          await tx.$executeRawUnsafe(
            `insert into public.property_assignments
               (property_id, organization_id, user_id, status)
             values ($1::uuid, $2::uuid, $3::uuid, 'active')`,
            propertyId,
            input.organizationId,
            userId,
          );
        }

        const invitation = only(
          await tx.$queryRawUnsafe<{ id: string }[]>(
            `insert into public.staff_invitations
               (organization_id, user_id, token_hash, status, expires_at, invited_by)
             values ($1::uuid, $2::uuid, $3, 'pending', $4::timestamptz, $5::uuid)
             returning id`,
            input.organizationId,
            userId,
            digest(token),
            expiresAt.toISOString(),
            context.userId,
          ),
          "the invitation",
        );

        await announce(tx, input.organizationId, userId, "invited");
        await recordWithin(tx, {
          organizationId: input.organizationId,
          actorId: context.userId,
          action: "staff.invited",
          subjectType: "membership",
          subjectId: membership.id,
          context: {
            userId,
            role: input.roleKey,
            properties: input.propertyIds?.length ?? 0,
          },
        });

        return {
          membershipId: membership.id,
          invitationId: invitation.id,
          token,
          expiresAt: expiresAt.toISOString(),
        };
      });
    } catch (error) {
      throw translate(error, "that invitation was refused");
    }
  }

  /**
   * Turns an invitation token into the membership it belongs to.
   *
   * Runs without a request context, because the person accepting cannot sign in
   * yet — the token is the authentication, which is why only its digest is
   * stored. The database function is the whole of the rule; there is nothing
   * here to get wrong twice.
   */
  async function accept(
    token: string,
  ): Promise<{ organizationId: string; userId: string }> {
    const rows = await deps.db.$queryRawUnsafe<
      { organization_id: string; user_id: string }[]
    >("select * from app.accept_staff_invitation($1)", digest(token));

    const accepted = rows[0];
    if (!accepted) {
      // One answer for withdrawn, expired, already used and never existed. They
      // are the same answer: the link does not work. Telling them apart would
      // confirm which Organizations have invited which addresses.
      throw new StaffRefusedError("that invitation is no longer open");
    }
    return {
      organizationId: accepted.organization_id,
      userId: accepted.user_id,
    };
  }

  /**
   * Changes what somebody may do.
   *
   * The commercial gate applies, and the trigger refuses if this was the last
   * membership able to add staff. Demoting yourself is allowed when you are not
   * the last one — your own sessions end with everybody else's (SP-S1-24).
   */
  async function changeRole(
    context: { userId: string },
    input: { organizationId: string; userId: string } & RoleReference,
  ): Promise<void> {
    await command(
      context,
      input.organizationId,
      input.userId,
      "staff.role_changed",
      { role: input.roleKey },
      (tx) =>
        tx.$executeRawUnsafe(
          `update public.organization_memberships
              set role = $3, role_scope_id = $4::uuid, updated_at = now()
            where organization_id = $1::uuid and user_id = $2::uuid
              and status = 'active'`,
          input.organizationId,
          input.userId,
          input.roleKey,
          input.roleScopeId ?? SHIPPED_SCOPE,
        ),
    );
  }

  /**
   * Gives somebody a Property to work at.
   *
   * Upsert, because SP-S1-19 says re-assigning a Property somebody used to
   * reach returns the same row: the record that they once reached it is not
   * something a second assignment should erase.
   */
  async function assignProperty(
    context: { userId: string },
    input: { organizationId: string; userId: string; propertyId: string },
  ): Promise<void> {
    await command(
      context,
      input.organizationId,
      input.userId,
      "staff.property_assigned",
      { propertyId: input.propertyId },
      (tx) =>
        tx.$executeRawUnsafe(
          `insert into public.property_assignments
             (property_id, organization_id, user_id, status)
           values ($1::uuid, $2::uuid, $3::uuid, 'active')
           on conflict (property_id, user_id) do update
             set status = 'active', revoked_at = null, updated_at = now()`,
          input.propertyId,
          input.organizationId,
          input.userId,
        ),
    );
  }

  /** Takes a Property away. Never blocked by money (SP-S1-21). */
  async function unassignProperty(
    context: { userId: string },
    input: { organizationId: string; userId: string; propertyId: string },
  ): Promise<void> {
    await command(
      context,
      input.organizationId,
      input.userId,
      "staff.property_unassigned",
      { propertyId: input.propertyId },
      (tx) =>
        tx.$executeRawUnsafe(
          `update public.property_assignments
              set status = 'revoked', revoked_at = now(), updated_at = now()
            where property_id = $1::uuid and user_id = $2::uuid
              and status = 'active'`,
          input.propertyId,
          input.userId,
        ),
    );
  }

  /**
   * Ends somebody's employment as far as Ranza is concerned.
   *
   * Nothing is deleted. The membership and its assignments become revoked and
   * the pending invitation is withdrawn in the same transaction, so a live
   * password link cannot outlive the job it was for (SP-S1-11, SP-S1-27).
   *
   * Not gated commercially. Blocking a revoke because an invoice is unpaid
   * turns a billing problem into a security incident (SP-S1-21).
   */
  async function revoke(
    context: { userId: string },
    input: { organizationId: string; userId: string },
  ): Promise<void> {
    await command(
      context,
      input.organizationId,
      input.userId,
      "staff.revoked",
      {},
      async (tx) => {
        const ended = await tx.$executeRawUnsafe(
          `update public.organization_memberships
              set status = 'revoked', revoked_at = now(), updated_at = now()
            where organization_id = $1::uuid and user_id = $2::uuid
              and status = 'active'`,
          input.organizationId,
          input.userId,
        );
        await tx.$executeRawUnsafe(
          `update public.property_assignments
              set status = 'revoked', revoked_at = now(), updated_at = now()
            where organization_id = $1::uuid and user_id = $2::uuid
              and status = 'active'`,
          input.organizationId,
          input.userId,
        );
        await tx.$executeRawUnsafe(
          `update public.staff_invitations
              set status = 'withdrawn', updated_at = now()
            where organization_id = $1::uuid and user_id = $2::uuid
              and status = 'pending'`,
          input.organizationId,
          input.userId,
        );
        return ended;
      },
    );
  }

  /**
   * Takes back a revoke made in the last day.
   *
   * The same row returns to active with its assignments, so the person is one
   * thread before and after rather than a second record of the same human
   * (SP-S1-14). The window lives in the statement's own predicate: a late undo
   * matches no row and reports a refusal, rather than raising from somewhere
   * further in.
   *
   * Wall clock, not a business date. An Organization has no business date —
   * ADR 0021 is about Properties (SP-S1-22).
   */
  async function undoRevoke(
    context: { userId: string },
    input: { organizationId: string; userId: string },
  ): Promise<void> {
    await command(
      context,
      input.organizationId,
      input.userId,
      "staff.revoke_undone",
      {},
      async (tx) => {
        const restored = await tx.$executeRawUnsafe(
          `update public.organization_memberships
              set status = 'active', revoked_at = null, updated_at = now()
            where organization_id = $1::uuid and user_id = $2::uuid
              and status = 'revoked'
              and revoked_at > now() - ($3 || ' hours')::interval`,
          input.organizationId,
          input.userId,
          String(UNDO_REVOKE_WINDOW_HOURS),
        );
        if (restored === 0) return 0;

        // Only the assignments that ended with the membership. An assignment
        // revoked on its own last week was a separate decision and undoing a
        // revoke is not the command that reverses it.
        await tx.$executeRawUnsafe(
          `update public.property_assignments as assignment
              set status = 'active', revoked_at = null, updated_at = now()
             from public.organization_memberships as membership
            where membership.organization_id = $1::uuid
              and membership.user_id = $2::uuid
              and assignment.organization_id = membership.organization_id
              and assignment.user_id = membership.user_id
              and assignment.status = 'revoked'
              and assignment.revoked_at > now() - ($3 || ' hours')::interval`,
          input.organizationId,
          input.userId,
          String(UNDO_REVOKE_WINDOW_HOURS),
        );
        return restored;
      },
    );
  }

  /**
   * Everybody who works for this Organization, and where they reach.
   *
   * Organization-wide and no wider — the policy decides that, not the query
   * (SP-S1-20). Revoked memberships are included, because a roster that hid
   * them would make the undo window invisible and the history unreadable.
   */
  async function readRoster(
    context: { userId: string },
    organizationId: string,
  ): Promise<StaffMember[]> {
    return withOrganizationContext(deps.db, context, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        {
          membership_id: string;
          user_id: string;
          email: string;
          role_id: string;
          role_name: string;
          status: string;
          accepted_at: Date | null;
          properties: { propertyId: string; propertyName: string }[] | null;
        }[]
      >(
        `select membership.id            as membership_id,
                membership.user_id       as user_id,
                account.email            as email,
                membership.role          as role_id,
                role.name                as role_name,
                membership.status        as status,
                membership.accepted_at   as accepted_at,
                (
                  select coalesce(
                    json_agg(json_build_object(
                      'propertyId', property.id, 'propertyName', property.name)
                      order by property.name),
                    '[]'::json)
                  from public.property_assignments as assignment
                  join public.properties as property
                    on property.id = assignment.property_id
                  where assignment.user_id = membership.user_id
                    and assignment.organization_id = membership.organization_id
                    and assignment.status = 'active'
                )                        as properties
           from public.organization_memberships as membership
           join public.users as account on account.id = membership.user_id
           join public.staff_roles as role
             on role.scope_id = membership.role_scope_id
            and role.key = membership.role
          where membership.organization_id = $1::uuid
          order by membership.status, account.email`,
        organizationId,
      );

      return rows.map((row) => ({
        membershipId: row.membership_id,
        userId: row.user_id,
        email: row.email,
        roleId: row.role_id,
        roleName: row.role_name,
        status: row.status === "revoked" ? "revoked" : "active",
        acceptedAt: row.accepted_at ? row.accepted_at.toISOString() : null,
        properties: row.properties ?? [],
      }));
    });
  }

  /**
   * The shape every reach-changing command shares.
   *
   * One transaction, one event, one audit record, and a refusal when the
   * statement matched nothing — which is what a policy denial looks like from
   * here once the row itself is unreachable, and what a stale command looks
   * like when it is not.
   */
  async function command(
    context: { userId: string },
    organizationId: string,
    subjectUserId: string,
    action: string,
    detail: Record<string, unknown>,
    run: (tx: Parameters<typeof recordWithin>[0]) => Promise<number>,
  ): Promise<void> {
    try {
      await withOrganizationContext(deps.db, context, async (tx) => {
        const changed = await run(tx as never);
        if (changed === 0) {
          throw new StaffRefusedError("nothing to change");
        }

        await announce(tx as never, organizationId, subjectUserId, action);
        await recordWithin(tx as never, {
          organizationId,
          actorId: context.userId,
          action,
          subjectType: "membership",
          subjectId: subjectUserId,
          context: detail,
        });
      });
    } catch (error) {
      throw translate(error, "that change was refused");
    }
  }

  /**
   * Says that somebody's reach changed, inside the transaction that changed it.
   *
   * Ids and no names (SP-S1-29). The handler that ends their sessions does not
   * exist yet, and this is what makes that a gap rather than a loss: the event
   * is in the queue when it does.
   */
  async function announce(
    tx: Parameters<typeof publishWithin>[0],
    organizationId: string,
    userId: string,
    cause: string,
  ): Promise<void> {
    await publishWithin(tx, {
      organizationId,
      eventType: "staff.reach_changed",
      payload: { userId, cause },
    });
  }

  return {
    invite,
    accept,
    changeRole,
    assignProperty,
    unassignProperty,
    revoke,
    undoRevoke,
    readRoster,
  };
}

export type StaffModule = ReturnType<typeof createStaffModule>;

/**
 * Turns a database refusal into the answer that belongs on a screen.
 *
 * `42501` is a policy: out of reach, unentitled, lapsed, or no such
 * Organization, all of which are deliberately the same sentence. `55000` is the
 * trigger, which is the one refusal an actor can act on.
 */
function translate(error: unknown, fallback: string): unknown {
  if (error instanceof StaffRefusedError) return error;
  if (raised(error, NOT_PERMITTED_BY_STATE)) {
    return new LastAdministratorError(
      "an Organization must keep somebody who can add staff",
    );
  }
  if (raised(error, UNIQUE_VIOLATION)) {
    return new AlreadyAMemberError(
      "that person already has a membership in this Organization",
    );
  }
  if (raised(error, INSUFFICIENT_PRIVILEGE)) {
    return new StaffRefusedError(fallback);
  }
  return error;
}
