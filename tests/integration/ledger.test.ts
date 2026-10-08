import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";
import {
  createFoliosModule,
  FOLIO_CAPABILITY,
  postChargeWithin,
  postPaymentWithin,
  type FolioWriteClient,
} from "../../packages/ranza/folios/src";
import {
  createReservationsModule,
  FRONT_DESK_CAPABILITY,
} from "../../packages/ranza/reservations/src";
import {
  postFolioLineToLedgerWithin,
  STANDARD_ACCOUNT_CODES,
} from "../../packages/adapters/ranza-finance/src";
import {
  getAccountBalancesWithin,
  type FinanceClient,
} from "../../packages/platform/finance/src";
import type { AuditClient } from "../../packages/platform/audit/src";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://ranza_app:ranza_app@localhost:54322/ranza?connection_limit=25&pool_timeout=30";
const DIRECT_URL =
  process.env.DIRECT_URL ?? "postgresql://ranza:ranza@localhost:54322/ranza";

const ORG = randomUUID();
const PROPERTY = randomUUID();
const MEMBER = randomUUID();
const UNIT = randomUUID();
const EMAIL = `ledger-${Date.now()}@ranza.test`;

describe("the ledger behind billing (blueprint 5.10)", () => {
  const prisma = createPrismaClient(DATABASE_URL);
  const owner = createPrismaClient(DIRECT_URL);
  const folios = createFoliosModule({ db: prisma });
  const reservations = createReservationsModule({ db: prisma });

  async function seed(): Promise<void> {
    await owner.$executeRawUnsafe(
      `insert into public.users (id, email) values
         ($1, $2)
       on conflict (id) do nothing`,
      MEMBER,
      EMAIL,
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
      `insert into public.accommodation_units
         (id, property_id, organization_id, name, unit_type, capacity) values
         ($1, $2, $3, 'LEDGER-101', 'room', 2)
       on conflict (id) do nothing`,
      UNIT,
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

    await owner.$executeRawUnsafe(
      `insert into public.organization_memberships
         (organization_id, user_id, role, access_scope) values
         ($1, $2, 'manager', 'organization_wide')
       on conflict (organization_id, user_id) do nothing`,
      ORG,
      MEMBER,
    );

    // Initialize chart of accounts for the organization
    await owner.$executeRawUnsafe(
      "select finance.ensure_default_accounts($1::uuid)",
      ORG,
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

  beforeAll(async () => {
    await seed();
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
    await owner.$disconnect();
  });

  it("a Folio line reaches the ledger without being re-entered anywhere", async () => {
    const folioId = await checkInGuest("Ledger Guest Test");

    let chargeLineId!: string;

    await withOrganizationContext(prisma, { userId: MEMBER }, async (tx) => {
      // 1. Post a charge of 500.00 TRY (50000 minor units) to the Folio
      const postedCharge = await postChargeWithin(
        tx as unknown as FolioWriteClient & AuditClient,
        MEMBER,
        {
          folioId,
          description: "Night in Deluxe Room",
          amountMinor: 50000,
        },
      );
      chargeLineId = postedCharge.lineId;

      // 2. The Folio line reaches the ledger through the adapter
      const chargeEntry = await postFolioLineToLedgerWithin(
        tx as unknown as FinanceClient,
        chargeLineId,
      );

      expect(chargeEntry).not.toBeNull();
      expect(chargeEntry?.sourceType).toBe("folio_line");
      expect(chargeEntry?.sourceId).toBe(chargeLineId);
      expect(chargeEntry?.currency).toBe("TRY");
      expect(chargeEntry?.lines).toHaveLength(2);

      // Double-entry check: Debit Receivables (1200), Credit Accommodation Revenue (4000)
      const debitLeg = chargeEntry?.lines.find((l) => l.direction === "debit");
      const creditLeg = chargeEntry?.lines.find(
        (l) => l.direction === "credit",
      );

      expect(debitLeg?.accountCode).toBe(STANDARD_ACCOUNT_CODES.RECEIVABLES);
      expect(debitLeg?.amountMinor).toBe(50000);
      expect(creditLeg?.accountCode).toBe(STANDARD_ACCOUNT_CODES.OTHER_REVENUE);
      expect(creditLeg?.amountMinor).toBe(50000);

      // 3. Post a payment of 500.00 TRY by card
      const { lineId: paymentLineId } = await postPaymentWithin(
        tx as unknown as FolioWriteClient & AuditClient,
        MEMBER,
        {
          folioId,
          description: "Card settlement at front desk",
          paymentMethod: "card",
          amountMinor: 50000,
        },
      );

      // 4. The payment line reaches the ledger through the adapter
      const paymentEntry = await postFolioLineToLedgerWithin(
        tx as unknown as FinanceClient,
        paymentLineId,
      );

      expect(paymentEntry).not.toBeNull();
      expect(paymentEntry?.lines).toHaveLength(2);

      // Double-entry check: Debit Card Clearing (1020), Credit Receivables (1200)
      const payDebit = paymentEntry?.lines.find((l) => l.direction === "debit");
      const payCredit = paymentEntry?.lines.find(
        (l) => l.direction === "credit",
      );

      expect(payDebit?.accountCode).toBe(STANDARD_ACCOUNT_CODES.CARD);
      expect(payDebit?.amountMinor).toBe(50000);
      expect(payCredit?.accountCode).toBe(STANDARD_ACCOUNT_CODES.RECEIVABLES);
      expect(payCredit?.amountMinor).toBe(50000);

      // 5. Check ledger balances: Receivables (1200) nets out to zero
      const balances = await getAccountBalancesWithin(
        tx as unknown as FinanceClient,
        ORG,
      );

      const receivables = balances.find(
        (b) => b.accountCode === STANDARD_ACCOUNT_CODES.RECEIVABLES,
      );
      expect(receivables).toBeDefined();
      expect(receivables?.netBalanceMinor).toBe(0);

      const card = balances.find(
        (b) => b.accountCode === STANDARD_ACCOUNT_CODES.CARD,
      );
      expect(card?.netBalanceMinor).toBe(50000);

      const revenue = balances.find(
        (b) => b.accountCode === STANDARD_ACCOUNT_CODES.OTHER_REVENUE,
      );
      expect(revenue?.netBalanceMinor).toBe(50000);

      // 6. Idempotency guarantee: Re-posting the same line returns existing entry, never duplicates
      const repeatedEntry = await postFolioLineToLedgerWithin(
        tx as unknown as FinanceClient,
        chargeLineId,
      );
      expect(repeatedEntry?.id).toBe(chargeEntry?.id);
    });

    // 7. Reversal: Reversing a charge posts exact reciprocal entry to ledger
    const { lineId: reversalLineId } = await folios.reverseLine(
      MEMBER,
      chargeLineId,
      "Incorrect rate applied",
    );

    await withOrganizationContext(prisma, { userId: MEMBER }, async (tx) => {
      const reversalEntry = await postFolioLineToLedgerWithin(
        tx as unknown as FinanceClient,
        reversalLineId,
      );

      expect(reversalEntry).not.toBeNull();
      expect(reversalEntry?.lines).toHaveLength(2);

      // Reversal double-entry check: Debit Revenue (4100), Credit Receivables (1200)
      const revDebit = reversalEntry?.lines.find(
        (l) => l.direction === "debit",
      );
      const revCredit = reversalEntry?.lines.find(
        (l) => l.direction === "credit",
      );

      expect(revDebit?.accountCode).toBe(STANDARD_ACCOUNT_CODES.OTHER_REVENUE);
      expect(revDebit?.amountMinor).toBe(50000);
      expect(revCredit?.accountCode).toBe(STANDARD_ACCOUNT_CODES.RECEIVABLES);
      expect(revCredit?.amountMinor).toBe(50000);
    });
  });
});
