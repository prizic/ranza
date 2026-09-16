/**
 * platform/audit through its public contract, against a real database.
 *
 * The pgTAP suite proves the table cannot be rewritten. This proves the module
 * in front of it opens a request context, so the same policies apply to a
 * caller who never writes SQL — and that a denied write raises rather than
 * returning quietly, which is the failure mode an audit trail cannot have.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuditModule } from "../../packages/platform/audit/src";
import { createPrismaClient } from "../../packages/db/src";

const ORG = "d2000002-0000-4000-8000-000000000001";
const OTHER_ORG = "d2000002-0000-4000-8000-000000000002";
const MEMBER = "d2000001-0000-4000-8000-000000000001";
const OUTSIDER = "d2000001-0000-4000-8000-000000000002";
const SUBJECT = "d2000003-0000-4000-8000-000000000001";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const audit = createAuditModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1,'audit-member@example.test'), ($2,'audit-outsider@example.test')
     on conflict (id) do nothing`,
    MEMBER,
    OUTSIDER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1,'Audit Module Organization','active'),
       ($2,'Audit Module Other','active')
     on conflict (id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  // The outsider belongs to somewhere else, so a denial below is about scope
  // rather than about having no membership at all.
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values
       ($1,$2,'owner','organization_wide'),
       ($3,$4,'owner','organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    MEMBER,
    OTHER_ORG,
    OUTSIDER,
  );
});

afterAll(async () => {
  // Records cannot be deleted — that is the whole point — so the fixture rows
  // stay, and the Organizations they belong to stay with them. Dropping the
  // memberships is what makes them unreachable again.
  await owner.$executeRawUnsafe(
    "delete from public.organization_memberships where organization_id in ($1,$2)",
    ORG,
    OTHER_ORG,
  );
  await owner.$disconnect();
  await prisma.$disconnect();
});

describe("recording what happened", () => {
  it("keeps an entry and reads it back", async () => {
    const written = await audit.record({
      organizationId: ORG,
      actorId: MEMBER,
      action: "organization.created",
      subjectType: "organization",
      subjectId: SUBJECT,
      reason: "opening a new Organization for the pilot",
      context: { plan: "core" },
    });

    expect(written.id).toMatch(/^[0-9a-f-]{36}$/);

    const history = await audit.historyOf(MEMBER, "organization", SUBJECT);
    expect(history.map((entry) => entry.action)).toContain(
      "organization.created",
    );
    expect(history[0]?.context).toEqual({ plan: "core" });
  });

  it("refuses an action name that is not a name", async () => {
    await expect(
      audit.record({
        organizationId: ORG,
        actorId: MEMBER,
        action: "Did A Thing",
        subjectType: "organization",
        subjectId: SUBJECT,
      }),
    ).rejects.toThrow(/action must look like/);
  });

  it("raises rather than returning quietly when the scope is out of reach", async () => {
    await expect(
      audit.record({
        organizationId: ORG,
        actorId: OUTSIDER,
        action: "organization.created",
        subjectType: "organization",
        subjectId: SUBJECT,
      }),
    ).rejects.toThrow();
  });

  it("shows another Organization no history for the same subject", async () => {
    await expect(
      audit.historyOf(OUTSIDER, "organization", SUBJECT),
    ).resolves.toEqual([]);
  });
});
