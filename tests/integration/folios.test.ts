/**
 * The first money in the product, against a real database.
 *
 * The pgTAP suite proves the policies, the grants and the triggers. This
 * proves the module in front of them: that posting a charge is one transaction
 * rather than two writes that usually both land, that the balance is the sum
 * of the lines rather than a number this process carried, and that a Folio
 * opens at check-in only where the Property actually does billing.
 *
 * Every assertion here was checked by breaking what it asserts. Moving the
 * audit record out of the transaction turns "nothing is left half-done" green
 * for a line with no record, which is the failure it exists to catch.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { latestRecord } from "./audit-record";
import { createAuditModule } from "../../packages/platform/audit/src";
import { createPrismaClient } from "../../packages/db/src";
import {
  createFoliosModule,
  FolioAmountError,
  FolioWriteError,
  FOLIO_CAPABILITY,
} from "../../packages/ranza/folios/src";
import {
  createReservationsModule,
  FRONT_DESK_CAPABILITY,
} from "../../packages/ranza/reservations/src";

const ORG = "d5000002-0000-4000-8000-000000000001";
const OTHER_ORG = "d5000002-0000-4000-8000-000000000002";
/** Trades in lira, does billing. */
const PROPERTY = "d5000003-0000-4000-8000-000000000001";
/** Same Organization, reachable, and deliberately never enables `finance`. */
const UNBILLED = "d5000003-0000-4000-8000-000000000002";
/** Another Organization entirely, trading in dirhams. */
const OTHER_PROPERTY = "d5000003-0000-4000-8000-000000000003";
const MEMBER = "d5000001-0000-4000-8000-000000000001";
const OUTSIDER = "d5000001-0000-4000-8000-000000000002";

/** One Unit per test, so no two of them contend for the exclusion constraint. */
const UNITS = Array.from(
  { length: 13 },
  (_, index) => `d5000004-0000-4000-8000-0000000000${String(index + 10)}`,
);
const UNBILLED_UNIT = "d5000004-0000-4000-8000-000000000099";
const OTHER_UNIT = "d5000004-0000-4000-8000-000000000098";

// The tenant query path exactly as the host composes it: ranza_app, which is
// not an owner and has no BYPASSRLS. Pointing this at DIRECT_URL would make
// every assertion below pass for the wrong reason.
const prisma = createPrismaClient(process.env.DATABASE_URL!);
const folios = createFoliosModule({ db: prisma });
const reservations = createReservationsModule({ db: prisma });
const audit = createAuditModule({ db: prisma });

const owner = createPrismaClient(process.env.DIRECT_URL!);

/**
 * The same module, given a client whose second statement in a transaction
 * fails.
 *
 * `withOrganizationContext` publishes the acting user with
 * `$executeRawUnsafe`, so the counted statements are the module's own: the
 * first is the write, the second is the audit record. Failing the second is
 * the half-done state two transactions would leave behind and one cannot, and
 * there is no input that produces it — which is why it is injected through the
 * seam ADR 0006 already requires, rather than contrived out of a bad argument.
 */
const interrupted = createFoliosModule({
  db: {
    $transaction: <T>(run: (tx: unknown) => Promise<T>) =>
      prisma.$transaction((tx) => {
        let statements = 0;
        return run({
          $executeRawUnsafe: (...args: unknown[]) =>
            (
              tx as never as Record<string, (...a: unknown[]) => unknown>
            ).$executeRawUnsafe(...args),
          $queryRawUnsafe: (...args: unknown[]) =>
            (
              tx as never as Record<string, (...a: unknown[]) => unknown>
            ).$queryRawUnsafe(...args),
          $queryRaw: (...args: unknown[]) => {
            statements += 1;
            if (statements > 1) {
              throw new Error("interrupted after the first write");
            }
            return (
              tx as never as Record<string, (...a: unknown[]) => unknown>
            ).$queryRaw(...args);
          },
        });
      }),
  } as never,
});

async function seed() {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1,'folio-member@example.test'), ($2,'folio-outsider@example.test')
     on conflict (id) do nothing`,
    MEMBER,
    OUTSIDER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1,'Folio Organization','active'), ($2,'Folio Other','active')
     on conflict (id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  // Two currencies on purpose: the Folio copies the Property's, and a test
  // that only ever saw one would not notice if it copied a constant instead.
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, timezone, currency) values
       ($1,$4,'Folio Property','Europe/Istanbul','TRY'),
       ($2,$4,'Folio Unbilled Property','Europe/Istanbul','TRY'),
       ($3,$5,'Folio Other Property','Asia/Dubai','AED')
     on conflict (id) do nothing`,
    PROPERTY,
    UNBILLED,
    OTHER_PROPERTY,
    ORG,
    OTHER_ORG,
  );

  const units = UNITS.map(
    (id, index) =>
      `('${id}'::uuid,'${PROPERTY}'::uuid,'${ORG}'::uuid,'FO-${100 + index}','room',2)`,
  ).join(",");
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity)
     values ${units},
       ('${UNBILLED_UNIT}'::uuid,'${UNBILLED}'::uuid,'${ORG}'::uuid,'UB-101','room',2),
       ('${OTHER_UNIT}'::uuid,'${OTHER_PROPERTY}'::uuid,'${OTHER_ORG}'::uuid,'OT-101','suite',4)
     on conflict (id) do nothing`,
  );

  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values
       ($1,'active'), ($2,'active')
     on conflict (organization_id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status) values
       ($1,$3,'active'), ($1,$4,'active'), ($2,$3,'active'), ($2,$4,'active')
     on conflict (organization_id, module_key) do nothing`,
    ORG,
    OTHER_ORG,
    FRONT_DESK_CAPABILITY.moduleKey,
    FOLIO_CAPABILITY.moduleKey,
  );
  // Every Property works a front desk. Only two of the three do billing, and
  // UNBILLED is the one that does not — which is what makes "a check-in still
  // works there" an assertion rather than a hope.
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1,$4,$6,true), ($2,$4,$6,true), ($3,$5,$6,true),
       ($1,$4,$7,true), ($3,$5,$7,true)
     on conflict (property_id, capability_key) do nothing`,
    PROPERTY,
    UNBILLED,
    OTHER_PROPERTY,
    ORG,
    OTHER_ORG,
    FRONT_DESK_CAPABILITY.capabilityKey,
    FOLIO_CAPABILITY.capabilityKey,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values
       ($1,$2,'manager','organization_wide'), ($3,$4,'manager','organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    MEMBER,
    OTHER_ORG,
    OUTSIDER,
  );
}

/**
 * A Reservation arriving today, checked in, with whatever Folio came with it.
 *
 * The date is computed by the database in the Property's timezone rather than
 * in this process, because that is what the arrivals query compares against. A
 * fixture built from the runner's clock would pass in Istanbul and fail in CI.
 */
async function checkInAt(
  propertyId: string,
  organizationId: string,
  unitId: string,
  guestName: string,
  actor = MEMBER,
): Promise<{ stayId: string; folioId: string | null }> {
  const reservationId = randomUUID();
  await owner.$executeRawUnsafe(
    `with guest as (
     -- The Guest is created with the Reservation, because a Reservation
     -- cannot exist without one. Its own row rather than a string, which is
     -- what ADR 0024 changed; the helpers' signatures are unchanged because a
     -- fixture still only cares about the name. (No backticks in this comment:
     -- the statement is a JS template literal.)
       insert into public.guests (organization_id, full_name)
       values ($2::uuid, $5)
       returning id
     )
     insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id,
        guest_id, stay_type, status, starts_on, ends_on)
     select $1::uuid, $2::uuid, $3::uuid, $4::uuid, guest.id, 'guest', 'confirmed',
            (now() at time zone property.timezone)::date,
            (now() at time zone property.timezone)::date + 3
     from public.properties as property, guest
     where property.id = $3::uuid`,
    reservationId,
    organizationId,
    propertyId,
    unitId,
    guestName,
  );
  return reservations.checkIn(actor, reservationId);
}

/** A Folio to work on, with its id proven non-null so tests can use it. */
async function folioAt(unitId: string, guestName: string): Promise<string> {
  const { folioId } = await checkInAt(PROPERTY, ORG, unitId, guestName);
  expect(folioId).not.toBeNull();
  return folioId!;
}

beforeAll(async () => {
  await seed();
});

afterAll(async () => {
  // The lines are the problem, and deliberately so. Nothing can remove one:
  // not the runtime role, and not this connection either, because the
  // append-only trigger fires for every role. Dropping it to clean up is
  // possible only because this holds the owner connection and may run DDL,
  // which is exactly the caveat the migration names — nothing in a database
  // survives a determined administrator, and that is not what the trigger
  // defends against. It defends against an ordinary statement.
  await owner.$executeRawUnsafe(
    `alter table public.folio_lines disable trigger folio_lines_append_only`,
  );
  for (const statement of [
    `delete from public.folio_lines where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.folios where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.stays where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.reservations where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.property_capabilities where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.organization_memberships where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.entitlements where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.subscriptions where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.accommodation_units where organization_id in ('${ORG}','${OTHER_ORG}')`,
    // After the Reservations that name them: a Guest is reached by a composite
    // foreign key, so the Organization cannot go while one still stands.
    `delete from public.guests where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.properties where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.organizations where id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.users where id in ('${MEMBER}','${OUTSIDER}')`,
  ]) {
    await owner.$executeRawUnsafe(statement);
  }
  await owner.$executeRawUnsafe(
    `alter table public.folio_lines enable trigger folio_lines_append_only`,
  );

  await owner.$disconnect();
  await prisma.$disconnect();
});

describe("a Folio opens with the Stay", () => {
  it("gives a checked-in Guest a Folio in the Property's own currency", async () => {
    const { stayId, folioId } = await checkInAt(
      PROPERTY,
      ORG,
      UNITS[0]!,
      "Ada Lovelace",
    );
    expect(folioId).not.toBeNull();

    const detail = await folios.folioDetail(MEMBER, folioId!);
    expect(detail?.stayId).toBe(stayId);
    expect(detail?.status).toBe("open");
    // Copied from the Property, not defaulted by this module and not supplied
    // by the caller, who has no business naming a currency.
    expect(detail?.currency).toBe("TRY");
    expect(detail?.balanceMinor).toBe(0);
    expect(detail?.lines).toEqual([]);
  });

  it("gives one in dirhams at a Property that trades in dirhams", async () => {
    const { folioId } = await checkInAt(
      OTHER_PROPERTY,
      OTHER_ORG,
      OTHER_UNIT,
      "Grace Hopper",
      OUTSIDER,
    );
    const detail = await folios.folioDetail(OUTSIDER, folioId!);
    expect(detail?.currency).toBe("AED");
  });

  it("checks a Guest in with no Folio where the Property does not do billing", async () => {
    // The case that decided openFolioWithin returns null instead of raising.
    // front_desk and finance are separate Entitlements, so an Organization
    // holding one and not the other must still be able to work its front desk.
    const { stayId, folioId } = await checkInAt(
      UNBILLED,
      ORG,
      UNBILLED_UNIT,
      "Katherine Johnson",
    );
    expect(stayId).toMatch(/^[0-9a-f-]{36}$/);
    expect(folioId).toBeNull();

    await expect(folios.listFolios(MEMBER, UNBILLED)).resolves.toEqual([]);
  });
});

describe("the balance is the sum of the lines", () => {
  it("adds up several charges, and is stored nowhere", async () => {
    const folioId = await folioAt(UNITS[1]!, "Hedy Lamarr");

    await folios.postCharge(MEMBER, {
      folioId,
      description: "Four nights",
      amountMinor: 400000,
    });
    await folios.postCharge(MEMBER, {
      folioId,
      description: "Minibar",
      amountMinor: 12550,
    });
    await folios.postCharge(MEMBER, {
      folioId,
      description: "Laundry",
      amountMinor: 7500,
    });

    const detail = await folios.folioDetail(MEMBER, folioId);
    expect(detail?.lineCount).toBe(3);
    expect(detail?.balanceMinor).toBe(420050);

    // The claim stated as arithmetic rather than as a constant: whatever the
    // lines are, the balance is their sum. A stored total would satisfy the
    // assertion above and fail this one the first time it drifted.
    const summed = detail!.lines.reduce(
      (total, line) => total + line.amountMinor,
      0,
    );
    expect(detail?.balanceMinor).toBe(summed);
  });

  it("follows a reversal down, keeping both lines", async () => {
    const folioId = await folioAt(UNITS[2]!, "Mary Jackson");

    const { lineId } = await folios.postCharge(MEMBER, {
      folioId,
      description: "Four nights",
      amountMinor: 400000,
    });
    const wrong = await folios.postCharge(MEMBER, {
      folioId,
      description: "Minibar",
      amountMinor: 12550,
    });

    await folios.reverseLine(MEMBER, wrong.lineId, "Charged to the wrong room");

    const detail = await folios.folioDetail(MEMBER, folioId);
    expect(detail?.balanceMinor).toBe(400000);
    // Nothing was removed to make that true. Three lines, and the corrected
    // one still says what it said.
    expect(detail?.lineCount).toBe(3);
    expect(
      detail!.lines.map((line) => line.amountMinor).sort((a, b) => a - b),
    ).toEqual([-12550, 12550, 400000]);

    const original = detail!.lines.find((line) => line.lineId === wrong.lineId);
    expect(original?.amountMinor).toBe(12550);
    expect(original?.reversed).toBe(true);

    const untouched = detail!.lines.find((line) => line.lineId === lineId);
    expect(untouched?.reversed).toBe(false);

    // What the audit log shows for it: where, and which charge for how much —
    // the facts a reversal is looked up for (AL-S1-06).
    const reversal = await latestRecord(owner, "folio.line_reversed", folioId);
    expect(reversal?.locationId).toBe(PROPERTY);
    expect(reversal?.reason).toBe("Charged to the wrong room");
    expect(reversal?.context).toMatchObject({
      reversedLineId: wrong.lineId,
      amountMinor: 12550,
      currency: expect.stringMatching(/^[A-Z]{3}$/),
      description: "Minibar",
    });
    const charge = await latestRecord(owner, "folio.charge_posted", folioId);
    expect(charge?.locationId).toBe(PROPERTY);
    expect(charge?.context).toMatchObject({
      currency: expect.stringMatching(/^[A-Z]{3}$/),
    });
  });

  it("refuses to reverse the same line twice", async () => {
    const folioId = await folioAt(UNITS[3]!, "Dorothy Vaughan");
    const { lineId } = await folios.postCharge(MEMBER, {
      folioId,
      description: "Late checkout",
      amountMinor: 5000,
    });
    await folios.reverseLine(MEMBER, lineId, "Waived");

    await expect(
      folios.reverseLine(MEMBER, lineId, "Waived again"),
    ).rejects.toBeInstanceOf(FolioWriteError);

    const detail = await folios.folioDetail(MEMBER, folioId);
    expect(detail?.balanceMinor).toBe(0);
    expect(detail?.lineCount).toBe(2);
  });
});

describe("posting a charge", () => {
  it("writes one line and one audit record naming the actor", async () => {
    const folioId = await folioAt(UNITS[4]!, "Annie Easley");

    const { lineId } = await folios.postCharge(MEMBER, {
      folioId,
      description: "Four nights",
      amountMinor: 400000,
    });

    const [line] = await owner.$queryRawUnsafe<
      { lineType: string; amount: string; organizationId: string }[]
    >(
      `select line_type as "lineType",
              amount_minor::text as "amount",
              organization_id as "organizationId"
       from public.folio_lines where id = $1::uuid`,
      lineId,
    );
    expect(line?.lineType).toBe("charge");
    expect(line?.amount).toBe("400000");
    // Read from the Folio by the insert, never taken from the caller.
    expect(line?.organizationId).toBe(ORG);

    const history = await audit.historyOf(MEMBER, "folio", folioId);
    expect(history).toHaveLength(1);
    expect(history[0]?.action).toBe("folio.charge_posted");
    expect(history[0]?.actorId).toBe(MEMBER);
    expect(history[0]?.context).toMatchObject({ lineId, amountMinor: 400000 });
  });

  it("leaves nothing half-done when the second write fails", async () => {
    const folioId = await folioAt(UNITS[5]!, "Melba Roy");
    const { lineId } = await folios.postCharge(MEMBER, {
      folioId,
      description: "Four nights",
      amountMinor: 400000,
    });

    // The reversal writes the line first and the audit record second, and the
    // claim is that those two share one fate. Proving it needs the second to
    // fail after the first has succeeded, which no input can arrange — every
    // bad input is refused before anything is written, which is the point of
    // validating at the boundary. So the failure is injected at the seam the
    // module already has: it receives its client (ADR 0006), and this one
    // fails the second statement of the transaction.
    //
    // The first attempt at this test used a 2500-character reason instead. It
    // passed, and it was measuring nothing: the reason is also the line's
    // description, so the *first* statement failed and the audit record was
    // never reached. Swallowing the audit error left it green, which is how
    // the substitution was found.
    await expect(
      interrupted.reverseLine(MEMBER, lineId, "Charged in error"),
    ).rejects.toThrow(/interrupted/);

    const detail = await folios.folioDetail(MEMBER, folioId);
    expect(detail?.lineCount).toBe(1);
    expect(detail?.balanceMinor).toBe(400000);
    expect(detail?.lines[0]?.reversed).toBe(false);

    // And the audit trail records the charge and not the reversal that never
    // happened. A record of an action that did not occur is as wrong as a
    // missing one.
    const history = await audit.historyOf(MEMBER, "folio", folioId);
    expect(history.map((entry) => entry.action)).toEqual([
      "folio.charge_posted",
    ]);
  });

  it("refuses a reason neither the line nor the record would accept", async () => {
    const folioId = await folioAt(UNITS[12]!, "Zaha Hadid");
    const { lineId } = await folios.postCharge(MEMBER, {
      folioId,
      description: "Four nights",
      amountMinor: 400000,
    });

    // Two characters satisfies the line's description check and not the audit
    // module's minimum, so without the boundary check this wrote the line and
    // then failed, naming a field the caller never mentioned.
    for (const reason of ["", "no", "x".repeat(2500)]) {
      await expect(
        folios.reverseLine(MEMBER, lineId, reason),
      ).rejects.toBeInstanceOf(FolioAmountError);
    }

    const detail = await folios.folioDetail(MEMBER, folioId);
    expect(detail?.lineCount).toBe(1);
  });

  it("refuses an amount that is not one", async () => {
    const folioId = await folioAt(UNITS[6]!, "Sabiha Gökçen");

    for (const amountMinor of [0, -100, 10.5, Number.MAX_SAFE_INTEGER + 2]) {
      await expect(
        folios.postCharge(MEMBER, { folioId, description: "No", amountMinor }),
      ).rejects.toBeInstanceOf(FolioAmountError);
    }
    await expect(
      folios.postCharge(MEMBER, {
        folioId,
        description: "   ",
        amountMinor: 100,
      }),
    ).rejects.toBeInstanceOf(FolioAmountError);

    const detail = await folios.folioDetail(MEMBER, folioId);
    expect(detail?.lineCount).toBe(0);
  });
});

describe("closing a Folio", () => {
  it("stops anything more being posted to it", async () => {
    const folioId = await folioAt(UNITS[7]!, "Cahit Arf");
    await folios.postCharge(MEMBER, {
      folioId,
      description: "Four nights",
      amountMinor: 400000,
    });

    await folios.closeFolio(MEMBER, folioId);

    const detail = await folios.folioDetail(MEMBER, folioId);
    expect(detail?.status).toBe("closed");
    // The balance survives closing. Closing is not settling, and nothing here
    // pretends otherwise.
    expect(detail?.balanceMinor).toBe(400000);

    await expect(
      folios.postCharge(MEMBER, {
        folioId,
        description: "Too late",
        amountMinor: 100,
      }),
    ).rejects.toBeInstanceOf(FolioWriteError);

    const history = await audit.historyOf(MEMBER, "folio", folioId);
    expect(history.map((entry) => entry.action)).toContain("folio.closed");

    const closed = await latestRecord(owner, "folio.closed", folioId);
    expect(closed?.locationId).toBe(PROPERTY);
    expect(closed?.context).toMatchObject({ balanceMinor: 400000 });
  });

  it("refuses a second closure rather than reporting success", async () => {
    const folioId = await folioAt(UNITS[8]!, "Aziz Sancar");
    await folios.closeFolio(MEMBER, folioId);

    await expect(folios.closeFolio(MEMBER, folioId)).rejects.toBeInstanceOf(
      FolioWriteError,
    );
  });
});

describe("a posted line cannot be changed", () => {
  it("refuses the runtime role, which is what serves every request", async () => {
    const folioId = await folioAt(UNITS[9]!, "Feza Gürsey");
    const { lineId } = await folios.postCharge(MEMBER, {
      folioId,
      description: "Four nights",
      amountMinor: 400000,
    });

    await expect(
      prisma.$executeRawUnsafe(
        `update public.folio_lines set amount_minor = 1 where id = $1::uuid`,
        lineId,
      ),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRawUnsafe(
        `delete from public.folio_lines where id = $1::uuid`,
        lineId,
      ),
    ).rejects.toThrow();
  });

  it("refuses the migration role too, which no policy binds", async () => {
    // The case that has already escaped once in this repository: audit.records
    // was append-only everywhere except production, because the trigger was
    // added to a migration that had already been applied. A policy and a
    // revoked grant say nothing to a role with BYPASSRLS. This connection is
    // that role.
    const folioId = await folioAt(UNITS[10]!, "Halide Edib");
    const { lineId } = await folios.postCharge(MEMBER, {
      folioId,
      description: "Four nights",
      amountMinor: 400000,
    });

    await expect(
      owner.$executeRawUnsafe(
        `update public.folio_lines set amount_minor = 1 where id = $1::uuid`,
        lineId,
      ),
    ).rejects.toThrow();
    await expect(
      owner.$executeRawUnsafe(
        `delete from public.folio_lines where id = $1::uuid`,
        lineId,
      ),
    ).rejects.toThrow();

    const [line] = await owner.$queryRawUnsafe<{ amount: string }[]>(
      `select amount_minor::text as "amount" from public.folio_lines where id = $1::uuid`,
      lineId,
    );
    expect(line?.amount).toBe("400000");
  });
});

describe("one Organization's money is not another's", () => {
  it("shows a Staff Member nothing from a Property in another Organization", async () => {
    await expect(folios.listFolios(MEMBER, OTHER_PROPERTY)).resolves.toEqual(
      [],
    );
  });

  it("shows nothing to a Staff Member of another Organization", async () => {
    await expect(folios.listFolios(OUTSIDER, PROPERTY)).resolves.toEqual([]);
  });

  it("hides a Folio from outside, and refuses every write to it", async () => {
    const folioId = await folioAt(UNITS[11]!, "Nazım Hikmet");

    await expect(folios.folioDetail(OUTSIDER, folioId)).resolves.toBeNull();
    await expect(
      folios.postCharge(OUTSIDER, {
        folioId,
        description: "Intruder",
        amountMinor: 100,
      }),
    ).rejects.toBeInstanceOf(FolioWriteError);
    await expect(folios.closeFolio(OUTSIDER, folioId)).rejects.toBeInstanceOf(
      FolioWriteError,
    );

    // The refusal must be a refusal, not a silent no-op that wrote the row.
    const detail = await folios.folioDetail(MEMBER, folioId);
    expect(detail?.lineCount).toBe(0);
    expect(detail?.status).toBe("open");
  });

  it("lists the Folios of a Property the viewer reaches, with their balances", async () => {
    const listed = await folios.listFolios(MEMBER, PROPERTY);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((folio) => folio.currency === "TRY")).toBe(true);
    // Guest names come from the Reservation each Stay was checked in from.
    expect(listed.map((folio) => folio.guestName)).toContain("Ada Lovelace");
  });
});
