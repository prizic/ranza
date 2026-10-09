/**
 * The ledger behind billing (blueprint 5.10, RANZ-41, ADR 0042), end to end.
 *
 * The pgTAP suite proves who may touch which row. This proves the path a real
 * Folio line takes: the Folios module writes it as `ranza_app`, the outbox
 * carries it, the dispatcher running as `ranza_worker` posts it through
 * `app.post_folio_line_to_ledger()`, and a member who holds
 * `finance.view_ledger` reads the entry back as `ranza_app`. Nobody posts to
 * the ledger by hand and nothing here can: the application role holds SELECT on
 * the ledger and the worker holds nothing on its tables.
 *
 * Each claim was checked by breaking it: granting `ranza_app` INSERT on
 * `finance.journal_entries`, dropping the permission from the read policy, and
 * making the handler return quietly on a missing line id.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";
import {
  createFoliosModule,
  FOLIO_CAPABILITY,
} from "../../packages/ranza/folios/src";
import {
  createReservationsModule,
  FRONT_DESK_CAPABILITY,
} from "../../packages/ranza/reservations/src";
import {
  getAccountBalancesWithin,
  getJournalEntryBySourceWithin,
  type FinanceClient,
} from "../../packages/platform/finance/src";
import {
  createOutboxDispatcher,
  publishWithin,
  type OutboxWriteClient,
} from "../../packages/platform/outbox/src";
import { subscriptions } from "../../apps/worker/src/outbox/subscriptions";

const ORG = randomUUID();
const PROPERTY = randomUUID();
const MEMBER = randomUUID();
const HOUSEKEEPER = randomUUID();
const EMAIL = `ledger-${Date.now()}@ranza.test`;
const HOUSEKEEPER_EMAIL = `ledger-housekeeper-${Date.now()}@ranza.test`;

/** The standard chart (`finance.ensure_default_accounts`). */
const ACCOUNT = {
  cash: "1000",
  card: "1020",
  receivables: "1200",
  roomRevenue: "4000",
  otherRevenue: "4100",
} as const;

// ranza_app for the front desk and the reader, ranza_worker for the dispatcher,
// exactly as the host and the worker compose them.
const prisma = createPrismaClient(process.env.DATABASE_URL!);
const workerDb = createPrismaClient(process.env.WORKER_DATABASE_URL!);
const dispatcher = createOutboxDispatcher({ db: workerDb });
const owner = createPrismaClient(process.env.DIRECT_URL!);
const folios = createFoliosModule({ db: prisma });
const reservations = createReservationsModule({ db: prisma });

// The first drain delivers whatever other suites left queued, and each pass is
// a real round trip per event.
const DATABASE_BUDGET_MS = 60_000;

/** Delivers everything that is due. A failing event backs off and stops being due. */
async function drain(): Promise<void> {
  for (let pass = 0; pass < 50; pass += 1) {
    const report = await dispatcher.dispatch(subscriptions);
    if (report.claimed === 0) return;
  }
  throw new Error("the outbox still had work after 50 passes");
}

/** Reads one entry as `userId`, through the application role's own policies. */
async function entryFor(userId: string, lineId: string) {
  return withOrganizationContext(prisma, { userId }, (tx) =>
    getJournalEntryBySourceWithin(
      tx as unknown as FinanceClient,
      ORG,
      "folio_line",
      lineId,
    ),
  );
}

async function seed(): Promise<void> {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values ($1, $2), ($3, $4)
     on conflict (id) do nothing`,
    MEMBER,
    EMAIL,
    HOUSEKEEPER,
    HOUSEKEEPER_EMAIL,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1, 'Ledger Integration Organization', 'active')
     on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, timezone, currency) values
       ($1, $2, 'Ledger Grand Hotel', 'Europe/Istanbul', 'TRY')
     on conflict (id) do nothing`,
    PROPERTY,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values
       ($1, 'active')
     on conflict (organization_id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status) values
       ($1, $2, 'active'), ($1, $3, 'active')
     on conflict (organization_id, module_key) do nothing`,
    ORG,
    FRONT_DESK_CAPABILITY.moduleKey,
    FOLIO_CAPABILITY.moduleKey,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1, $2, $3, true),
       ($1, $2, $4, true)
     on conflict (property_id, capability_key) do nothing`,
    PROPERTY,
    ORG,
    FRONT_DESK_CAPABILITY.capabilityKey,
    FOLIO_CAPABILITY.capabilityKey,
  );
  // A Manager reads the ledger (finance.view_ledger is shipped on Manager); a
  // Housekeeping member reaches the whole Organization and does not.
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values
       ($1, $2, 'manager', 'organization_wide'),
       ($1, $3, 'housekeeping', 'organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    MEMBER,
    HOUSEKEEPER,
  );
}

async function checkInGuest(guestName: string): Promise<string> {
  const unitId = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity) values
       ($1, $2, $3, $4, 'room', 2)
     on conflict (id) do nothing`,
    unitId,
    PROPERTY,
    ORG,
    "LEDGER-" + unitId.slice(0, 6),
  );

  const reservationId = randomUUID();
  await owner.$executeRawUnsafe(
    `with guest as (
       insert into public.guests (organization_id, full_name)
       values ($2::uuid, $5)
       returning id
     )
     insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id,
        guest_id, stay_type, status, starts_on, ends_on)
     select $1::uuid, $2::uuid, $3::uuid, $4::uuid, guest.id, 'guest', 'confirmed',
            app.property_today(property.id),
            app.property_today(property.id) + 2
     from public.properties as property, guest
     where property.id = $3::uuid`,
    reservationId,
    ORG,
    PROPERTY,
    unitId,
    guestName,
  );

  const { folioId } = await reservations.checkIn(MEMBER, reservationId);
  expect(folioId).not.toBeNull();
  return folioId!;
}

beforeAll(seed, DATABASE_BUDGET_MS);

afterAll(async () => {
  await prisma.$disconnect();
  await workerDb.$disconnect();
  await owner.$disconnect();
});

describe("the ledger behind billing (blueprint 5.10)", () => {
  it(
    "a Folio line reaches the ledger without being re-entered anywhere",
    async () => {
      const folioId = await checkInGuest("Ledger Guest Test");

      // 1. A charge of 500.00 TRY, written by the front desk as ranza_app. This
      // is the whole of what a person does; the ledger is not touched here.
      const { lineId: chargeLineId } = await folios.postCharge(MEMBER, {
        folioId,
        description: "Night in Deluxe Room",
        amountMinor: 50000,
      });
      expect(await entryFor(MEMBER, chargeLineId)).toBeNull();

      // 2. The worker delivers it.
      await drain();

      const chargeEntry = await entryFor(MEMBER, chargeLineId);
      expect(chargeEntry).not.toBeNull();
      expect(chargeEntry?.sourceType).toBe("folio_line");
      expect(chargeEntry?.sourceId).toBe(chargeLineId);
      expect(chargeEntry?.currency).toBe("TRY");
      expect(chargeEntry?.lines).toHaveLength(2);

      // Double entry: Debit Receivables (1200), Credit Other Revenue (4100).
      const debitLeg = chargeEntry?.lines.find((l) => l.direction === "debit");
      const creditLeg = chargeEntry?.lines.find(
        (l) => l.direction === "credit",
      );
      expect(debitLeg?.accountCode).toBe(ACCOUNT.receivables);
      expect(debitLeg?.amountMinor).toBe(50000);
      expect(creditLeg?.accountCode).toBe(ACCOUNT.otherRevenue);
      expect(creditLeg?.amountMinor).toBe(50000);

      // 3. A payment of 500.00 TRY by card.
      const { lineId: paymentLineId } = await folios.postPayment(MEMBER, {
        folioId,
        description: "Card settlement at front desk",
        paymentMethod: "card",
        amountMinor: 50000,
      });
      await drain();

      const paymentEntry = await entryFor(MEMBER, paymentLineId);
      expect(paymentEntry?.lines).toHaveLength(2);
      const payDebit = paymentEntry?.lines.find((l) => l.direction === "debit");
      const payCredit = paymentEntry?.lines.find(
        (l) => l.direction === "credit",
      );
      expect(payDebit?.accountCode).toBe(ACCOUNT.card);
      expect(payDebit?.amountMinor).toBe(50000);
      expect(payCredit?.accountCode).toBe(ACCOUNT.receivables);
      expect(payCredit?.amountMinor).toBe(50000);

      // 4. Receivables nets out to zero, and the card clearing account holds
      // what was collected.
      const balances = await withOrganizationContext(
        prisma,
        { userId: MEMBER },
        (tx) =>
          getAccountBalancesWithin(tx as unknown as FinanceClient, ORG, "TRY"),
      );
      const balanceOf = (code: string) =>
        balances.find((b) => b.accountCode === code)?.netBalanceMinor;
      expect(balanceOf(ACCOUNT.receivables)).toBe(0);
      expect(balanceOf(ACCOUNT.card)).toBe(50000);
      expect(balanceOf(ACCOUNT.otherRevenue)).toBe(50000);

      // 5. Delivering again changes nothing: the entry is the same one.
      await drain();
      expect((await entryFor(MEMBER, chargeLineId))?.id).toBe(chargeEntry?.id);

      // 6. A reversal posts the reciprocal entry.
      const { lineId: reversalLineId } = await folios.reverseLine(
        MEMBER,
        chargeLineId,
        "Incorrect rate applied",
      );
      await drain();

      const reversalEntry = await entryFor(MEMBER, reversalLineId);
      expect(reversalEntry?.lines).toHaveLength(2);
      const revDebit = reversalEntry?.lines.find(
        (l) => l.direction === "debit",
      );
      const revCredit = reversalEntry?.lines.find(
        (l) => l.direction === "credit",
      );
      expect(revDebit?.accountCode).toBe(ACCOUNT.otherRevenue);
      expect(revDebit?.amountMinor).toBe(50000);
      expect(revCredit?.accountCode).toBe(ACCOUNT.receivables);
      expect(revCredit?.amountMinor).toBe(50000);

      // 7. A room night credits Room Revenue (4000). The close of the day
      // posts these as the owner would, so the fixture does too.
      const roomChargeLineId = randomUUID();
      await owner.$executeRawUnsafe(
        `insert into public.folio_lines
           (id, organization_id, property_id, folio_id, line_type, description, amount_minor, source, business_date)
         values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'charge', 'Night in Deluxe Room - Room Night', 120000, 'room_night', app.property_today($3::uuid) - 1)`,
        roomChargeLineId,
        ORG,
        PROPERTY,
        folioId,
      );
      await drain();

      const roomEntry = await entryFor(MEMBER, roomChargeLineId);
      const roomCredit = roomEntry?.lines.find((l) => l.direction === "credit");
      expect(roomCredit?.accountCode).toBe(ACCOUNT.roomRevenue);
      expect(roomCredit?.amountMinor).toBe(120000);

      // 8. Reversing a payment debits Receivables and credits where it settled.
      const { lineId: refundedPaymentId } = await folios.postPayment(MEMBER, {
        folioId,
        description: "Payment to be reversed",
        paymentMethod: "card",
        amountMinor: 30000,
      });
      const { lineId: paymentReversalLineId } = await folios.reverseLine(
        MEMBER,
        refundedPaymentId,
        "Duplicate swipe refund",
      );
      await drain();

      const payRevEntry = await entryFor(MEMBER, paymentReversalLineId);
      const payRevDebit = payRevEntry?.lines.find(
        (l) => l.direction === "debit",
      );
      const payRevCredit = payRevEntry?.lines.find(
        (l) => l.direction === "credit",
      );
      expect(payRevDebit?.accountCode).toBe(ACCOUNT.receivables);
      expect(payRevDebit?.amountMinor).toBe(30000);
      expect(payRevCredit?.accountCode).toBe(ACCOUNT.card);
      expect(payRevCredit?.amountMinor).toBe(30000);
    },
    DATABASE_BUDGET_MS,
  );
});

describe("who reads and who writes the ledger", () => {
  it(
    "a_member_without_finance_view_ledger_reads_no_entry_of_their_own_organization",
    async () => {
      const folioId = await checkInGuest("Ledger Guest Housekeeping");
      const { lineId } = await folios.postCharge(MEMBER, {
        folioId,
        description: "Minibar",
        amountMinor: 2500,
      });
      await drain();

      // The control: the Manager reads the entry the Housekeeping member cannot.
      expect(await entryFor(MEMBER, lineId)).not.toBeNull();
      expect(await entryFor(HOUSEKEEPER, lineId)).toBeNull();
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "the_application_role_cannot_write_the_ledger_whoever_it_speaks_for",
    async () => {
      await expect(
        withOrganizationContext(prisma, { userId: MEMBER }, (tx) =>
          tx.$executeRawUnsafe(
            `insert into finance.journal_entries
               (organization_id, currency, description, source_type, source_id)
             values ($1::uuid, 'TRY', 'Forged revenue', 'folio_line', $2::uuid)`,
            ORG,
            randomUUID(),
          ),
        ),
      ).rejects.toThrow(/permission denied/);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "the_worker_role_holds_nothing_on_the_ledger_tables",
    async () => {
      await expect(
        workerDb.$queryRawUnsafe(
          "select count(*) from finance.journal_entries",
        ),
      ).rejects.toThrow(/permission denied/);
    },
    DATABASE_BUDGET_MS,
  );
});

describe("a posting that fails is visible", () => {
  it(
    "an_event_that_names_no_line_is_recorded_and_left_dead_not_delivered",
    async () => {
      // What `ranza_app` can publish today: an event in its own Organization
      // with any payload. The old handler returned quietly on this and marked
      // it delivered.
      const eventId = await withOrganizationContext(
        prisma,
        { userId: MEMBER },
        async (tx) => {
          const { eventId: id } = await publishWithin(
            tx as unknown as OutboxWriteClient,
            {
              organizationId: ORG,
              eventType: "folio.line_posted",
              payload: {},
            },
          );
          return id;
        },
      );

      await drain();

      const failed = await owner.$queryRawUnsafe<
        {
          attempts: number;
          lastError: string | null;
          publishedAt: Date | null;
          deadAt: Date | null;
        }[]
      >(
        `select attempts, last_error as "lastError",
                published_at as "publishedAt", dead_at as "deadAt"
           from outbox.events where id = $1::uuid`,
        eventId,
      );
      expect(failed[0]?.attempts).toBe(1);
      expect(failed[0]?.lastError).toMatch(/names no lineId/);
      expect(failed[0]?.publishedAt).toBeNull();
      expect(failed[0]?.deadAt).toBeNull();

      const delivered = await owner.$queryRawUnsafe<{ count: bigint }[]>(
        `select count(*) as count from outbox.deliveries
          where consumer = 'finance.postFolioLineToLedger' and event_id = $1::uuid`,
        eventId,
      );
      expect(Number(delivered[0]?.count)).toBe(0);

      // One attempt short of the cap, then due again: the next failure is the
      // terminal one, and it is recorded as dead rather than retried.
      await owner.$executeRawUnsafe(
        `update outbox.events set attempts = 7, available_at = now()
          where id = $1::uuid`,
        eventId,
      );
      const report = await dispatcher.dispatch(subscriptions);
      expect(report.dead).toBeGreaterThanOrEqual(1);

      const dead = await owner.$queryRawUnsafe<{ deadAt: Date | null }[]>(
        `select dead_at as "deadAt" from outbox.events where id = $1::uuid`,
        eventId,
      );
      expect(dead[0]?.deadAt).not.toBeNull();
    },
    DATABASE_BUDGET_MS,
  );
});
