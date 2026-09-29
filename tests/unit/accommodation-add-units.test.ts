/**
 * The shapes `addUnits` refuses before it asks the database anything
 * (RB-S2-08, RB-S2-09, RB-S2-12).
 *
 * Nothing here needs a database, and that is the point: the client is a stub
 * that throws on any property read, so a refusal that reached for a connection
 * — a transaction opened, a statement run — fails these as loudly as one that
 * returned the wrong sentence. The database's own copies of these bounds (the
 * capacity constraint, the nesting check) are proved in pgTAP.
 */
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../../packages/db/src";
import {
  BEDS_PER_ROOM,
  createAccommodationModule,
  UNIT_BATCH,
  UnitConfigurationError,
  type NewUnits,
} from "../../packages/ranza/accommodation/src";

const untouchable = new Proxy(
  {},
  {
    get(_target, property) {
      throw new Error(`the database was reached through ${String(property)}`);
    },
  },
) as PrismaClient;

const accommodation = createAccommodationModule({ db: untouchable });

const SOME_USER = "00000000-0000-4000-8000-000000000001";

const room: NewUnits = {
  propertyId: "00000000-0000-4000-8000-000000000002",
  building: null,
  floor: 1,
  unitType: "room",
  firstNumber: "101",
  count: 1,
  capacity: 2,
  letByTheBed: false,
};

async function refusal(input: NewUnits): Promise<string> {
  const outcome = await accommodation.addUnits(SOME_USER, input).then(
    () => null,
    (error: unknown) => error,
  );
  expect(outcome).toBeInstanceOf(UnitConfigurationError);
  return (outcome as UnitConfigurationError).message;
}

describe("adding rooms is refused by its shape, before any statement runs", () => {
  it("an add is between one and sixty rooms (RB-S2-09)", async () => {
    expect(UNIT_BATCH).toEqual({ min: 1, max: 60 });
    expect(await refusal({ ...room, count: 0 })).toBe(
      "one to sixty rooms in one go",
    );
    expect(await refusal({ ...room, count: 61 })).toBe(
      "one to sixty rooms in one go",
    );
    expect(await refusal({ ...room, count: 2.5 })).toBe(
      "one to sixty rooms in one go",
    );
    // The bounds themselves are allowed through, to the (stub) database.
    for (const count of [1, 60]) {
      await expect(
        accommodation.addUnits(SOME_USER, { ...room, count }),
      ).rejects.toThrow(/the database was reached/);
    }
  });

  it("a room holds at most twenty six beds (RB-S2-08)", async () => {
    expect(BEDS_PER_ROOM.max).toBe(26);
    expect(await refusal({ ...room, letByTheBed: true, capacity: 27 })).toBe(
      "a room holds at most twenty-six beds",
    );
    // Twenty-six is a full dormitory, and goes through to the (stub) database.
    await expect(
      accommodation.addUnits(SOME_USER, {
        ...room,
        letByTheBed: true,
        capacity: 26,
      }),
    ).rejects.toThrow(/the database was reached/);
  });

  it("only a room is let by the bed (RB-S2-12)", async () => {
    for (const unitType of ["suite", "apartment", "bed"] as const) {
      expect(
        await refusal({ ...room, unitType, letByTheBed: true, capacity: 3 }),
      ).toBe("only a room is let by the bed");
    }
  });
});
