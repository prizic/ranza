/**
 * Which failures a Folio command calls a refusal (FO-S9-04, FO-S4-09).
 *
 * A refusal is one of the SQLSTATEs the policies, triggers and constraints
 * raise, and becomes a FolioWriteError: one answer for every reason, so a
 * Folio the caller cannot see is not confirmed to exist. Anything else — a
 * lost connection, a schema that moved — travels on as itself, so the screen
 * records it instead of showing it as one more refusal. A bare catch did the
 * opposite, and a lost connection on Finance was invisible.
 *
 * The client is a stub, because no input to a real database produces a lost
 * connection on demand; the seam is the one ADR 0006 already requires.
 */
import { describe, expect, it } from "vitest";
import {
  createFoliosModule,
  FolioWriteError,
} from "../../packages/ranza/folios/src";

const USER = "df000001-0000-4000-8000-000000000001";
const LINE = "df000008-0000-4000-8000-000000000001";
const FOLIO = "df000007-0000-4000-8000-000000000001";

/** A raw-query failure as Prisma reports one: P2010, the SQLSTATE in `meta`. */
function refusedWith(code: string): Error {
  return Object.assign(new Error("Raw query failed."), {
    code: "P2010",
    meta: { driverAdapterError: { cause: { code } } },
  });
}

/** A module whose every query fails with `error`. */
function failingWith(error: Error) {
  const tx = {
    $executeRawUnsafe: async () => 0,
    $queryRaw: async () => {
      throw error;
    },
    $queryRawUnsafe: async () => {
      throw error;
    },
  };
  return createFoliosModule({
    db: {
      $transaction: <T>(run: (client: typeof tx) => Promise<T>) => run(tx),
    } as never,
  });
}

const lost = () => new Error("Connection terminated unexpectedly");

const commands = {
  reverseLine: {
    run: (folios: ReturnType<typeof failingWith>) =>
      folios.reverseLine(USER, LINE, "Charged in error"),
    refusals: ["42501", "23505", "23514", "23503"],
  },
  postCharge: {
    run: (folios: ReturnType<typeof failingWith>) =>
      folios.postCharge(USER, {
        folioId: FOLIO,
        description: "Minibar",
        amountMinor: 100,
      }),
    refusals: ["42501", "23514", "23503"],
  },
  postPayment: {
    run: (folios: ReturnType<typeof failingWith>) =>
      folios.postPayment(USER, {
        folioId: FOLIO,
        description: "Front desk payment",
        paymentMethod: "card",
        amountMinor: 100,
      }),
    refusals: ["42501", "23514", "23503"],
  },
  closeFolio: {
    run: (folios: ReturnType<typeof failingWith>) =>
      folios.closeFolio(USER, FOLIO),
    refusals: ["55000"],
  },
} as const;

describe("a Folio command's failures", () => {
  for (const [name, { run, refusals }] of Object.entries(commands)) {
    it(`${name}: a lost connection travels on as itself`, async () => {
      const failure = lost();
      await expect(run(failingWith(failure))).rejects.toBe(failure);
    });

    for (const code of refusals) {
      it(`${name}: ${code} is a refusal, with the database's answer as its cause`, async () => {
        const failure = refusedWith(code);
        const refused = await run(failingWith(failure)).catch(
          (error: unknown) => error,
        );
        expect(refused).toBeInstanceOf(FolioWriteError);
        expect((refused as Error).cause).toBe(failure);
      });
    }

    it(`${name}: a code it does not mean is not a refusal`, async () => {
      // 40P01, a deadlock: worth a retry and a log line, not "refused".
      const failure = refusedWith("40P01");
      await expect(run(failingWith(failure))).rejects.toBe(failure);
    });
  }
});
