/**
 * What a refused move becomes (RC-S3-09).
 *
 * A drop on the room calendar saves through Change booking, Move Guest or
 * Change departure, and a race it could not foresee comes back from the command
 * as an error. The integration suite proves the command raises each; this
 * proves the one hop after it, that each becomes the outcome the dialog words —
 * including when the error is of a class this file cannot see. A dev server
 * evaluates a package once per bundle, so the module's `UnitUnavailableError`
 * and the one imported here can be two classes with one name, and `instanceof`
 * then calls a plain refusal an incident. The name is what survives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const amendBooking = vi.fn();
const moveGuest = vi.fn();
const changeDeparture = vi.fn();

vi.mock("../../apps/operator-workspace/node_modules/next/cache", () => ({
  revalidatePath: () => undefined,
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  currentViewer: async () => ({
    userId: "dd000001-0000-4000-8000-000000000001",
  }),
}));
vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({
    reservations: { amendBooking, moveGuest, changeDeparture },
  }),
}));

const actions =
  await import("../../apps/operator-workspace/src/server/front-office");
const refusals =
  await import("../../packages/ranza/reservations/src/contracts");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const BOOKING = form({
  locale: "en",
  reservation: "dd000005-0000-4000-8000-000000000001",
  unit: "dd000004-0000-4000-8000-000000000001",
  startsOn: "2026-10-12",
  endsOn: "2026-10-14",
  version: "0",
  quotedRateMinor: "",
  quotedCurrency: "",
});
const GUEST = form({
  locale: "en",
  stay: "dd000006-0000-4000-8000-000000000001",
  unit: "dd000004-0000-4000-8000-000000000001",
  reason: "upgrade",
  version: "0",
});
const DEPARTURE = form({
  locale: "en",
  stay: "dd000006-0000-4000-8000-000000000001",
  endsOn: "2026-10-15",
  version: "0",
});

/** The same error from another bundle: a class of its own, with the module's name. */
function fromAnotherBundle(name: string): Error {
  const Lookalike = class extends Error {};
  Object.defineProperty(Lookalike, "name", { value: name });
  const error = new Lookalike("refused");
  error.name = name;
  return error;
}

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  for (const command of [amendBooking, moveGuest, changeDeparture]) {
    command.mockReset().mockResolvedValue({});
  }
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => logged.mockRestore());

const BOOKING_REFUSALS = [
  ["UnitUnavailableError", "unavailable"],
  ["UnitHasOccupantError", "occupied"],
  ["UnitNotInServiceError", "notInService"],
  ["BookingChangedError", "changed"],
  ["PriceChangedError", "priceChanged"],
] as const;

describe("a booking moved from the room calendar", () => {
  it.each(BOOKING_REFUSALS)(
    "%s becomes %s, whether or not its class is this file's",
    async (name, outcome) => {
      const Refusal = refusals[name] as new (message?: string) => Error;
      amendBooking.mockRejectedValueOnce(new Refusal("refused"));
      expect(await actions.changeBooking("idle", BOOKING)).toBe(outcome);

      amendBooking.mockRejectedValueOnce(fromAnotherBundle(name));
      expect(await actions.changeBooking("idle", BOOKING)).toBe(outcome);
      // Refusals are answers, never incidents.
      expect(logged).not.toHaveBeenCalled();
    },
  );

  it("an error nobody expected is recorded and answered as a refusal", async () => {
    amendBooking.mockRejectedValueOnce(new Error("connection reset"));
    expect(await actions.changeBooking("idle", BOOKING)).toBe("refused");
    expect(logged).toHaveBeenCalledTimes(1);
  });
});

describe("a Guest moved from the room calendar", () => {
  it.each([
    ["UnitHasOccupantError", "occupied"],
    ["UnitUnavailableError", "unavailable"],
    ["UnitNotInServiceError", "notInService"],
    ["UnitNotReadyError", "notReady"],
    ["BookingChangedError", "changed"],
  ] as const)(
    "%s becomes %s from another bundle too",
    async (name, outcome) => {
      moveGuest.mockRejectedValueOnce(fromAnotherBundle(name));
      expect(await actions.moveGuest("idle", GUEST)).toBe(outcome);
      expect(logged).not.toHaveBeenCalled();
    },
  );
});

describe("a departure pulled from the room calendar", () => {
  it.each([
    ["UnitHasOccupantError", "occupied"],
    ["ReservationPeriodError", "invalidPeriod"],
    ["BookingChangedError", "changed"],
  ] as const)(
    "%s becomes %s from another bundle too",
    async (name, outcome) => {
      changeDeparture.mockRejectedValueOnce(fromAnotherBundle(name));
      expect(await actions.changeDeparture("idle", DEPARTURE)).toBe(outcome);
      expect(logged).not.toHaveBeenCalled();
    },
  );
});
