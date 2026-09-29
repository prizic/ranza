/**
 * What the booking and check-in forms become, and what they tell the desk
 * (decision sheet 2026-09-29).
 *
 * The integration suites prove the module raises each refusal against a real
 * database. This proves the one hop they cannot reach: the server action that
 * turns each refusal into the outcome a screen words, and records the failures
 * nobody expected — never the module's own refusals, which are answers rather
 * than incidents.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createReservation = vi.fn();
const checkIn = vi.fn();
const revalidatePath = vi.fn();

vi.mock("../../apps/operator-workspace/node_modules/next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  currentViewer: async () => ({ userId: VIEWER }),
}));
vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({ reservations: { createReservation, checkIn } }),
}));

const VIEWER = "dd000001-0000-4000-8000-000000000001";
const PROPERTY = "dd000003-0000-4000-8000-000000000001";
const UNIT = "dd000004-0000-4000-8000-000000000001";
const RESERVATION = "dd000005-0000-4000-8000-000000000001";

const actions =
  await import("../../apps/operator-workspace/src/server/front-office");
const {
  CheckInError,
  CheckInTooEarlyError,
  ReservationRefusedError,
  UnitHasOccupantError,
  UnitUnavailableError,
} = await import("../../packages/ranza/reservations/src");

function booking(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    locale: "en",
    property: PROPERTY,
    unit: UNIT,
    stayType: "guest",
    guestName: "Ada Lovelace",
    startsOn: "2026-10-01",
    endsOn: "2026-10-03",
    quotedRateMinor: "",
    quotedCurrency: "",
    ...overrides,
  })) {
    form.append(key, value);
  }
  return form;
}

function arrival(): FormData {
  const form = new FormData();
  form.append("locale", "en");
  form.append("reservation", RESERVATION);
  return form;
}

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  createReservation.mockReset().mockResolvedValue({});
  checkIn.mockReset().mockResolvedValue({});
  revalidatePath.mockReset();
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => logged.mockRestore());

describe("taking a booking", () => {
  it("RG-S1-40: refuses a stay type that is neither guest nor resident, before the module", async () => {
    expect(
      await actions.createReservation("idle", booking({ stayType: "student" })),
    ).toBe("refused");
    expect(createReservation).not.toHaveBeenCalled();

    for (const stayType of ["guest", "resident"]) {
      await actions.createReservation("idle", booking({ stayType }));
    }
    expect(createReservation).toHaveBeenCalledTimes(2);
  });

  it("RG-S3-07: words a booked Unit and a Unit with somebody in it differently", async () => {
    createReservation.mockRejectedValueOnce(
      new UnitUnavailableError("that Accommodation Unit is booked"),
    );
    expect(await actions.createReservation("idle", booking())).toBe(
      "unavailable",
    );
    createReservation.mockRejectedValueOnce(
      new UnitHasOccupantError("that Accommodation Unit has somebody in it"),
    );
    expect(await actions.createReservation("idle", booking())).toBe("occupied");
    expect(logged).not.toHaveBeenCalled();
  });

  it("RG-S3-09: an unexpected failure is refused and recorded; the module's refusal only refused", async () => {
    createReservation.mockRejectedValueOnce(
      new ReservationRefusedError("that booking cannot be taken"),
    );
    expect(await actions.createReservation("idle", booking())).toBe("refused");
    expect(logged).not.toHaveBeenCalled();

    const lost = new Error("connection terminated unexpectedly");
    createReservation.mockRejectedValueOnce(lost);
    expect(await actions.createReservation("idle", booking())).toBe("refused");
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]).toContain(lost);
  });
});

describe("checking in", () => {
  it("CI-S1-20: an unexpected failure is refused and recorded; the module's refusal only refused", async () => {
    checkIn.mockRejectedValueOnce(
      new CheckInError("that Reservation cannot be checked in"),
    );
    expect(await actions.checkInReservation("idle", arrival())).toBe("refused");
    expect(logged).not.toHaveBeenCalled();

    const lost = new Error("connection terminated unexpectedly");
    checkIn.mockRejectedValueOnce(lost);
    expect(await actions.checkInReservation("idle", arrival())).toBe("refused");
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]).toContain(lost);
  });

  it("CI-S1-07: an early arrival is its own answer, and not an incident", async () => {
    checkIn.mockRejectedValueOnce(new CheckInTooEarlyError("2026-10-05"));
    expect(await actions.checkInReservation("idle", arrival())).toBe(
      "tooEarly",
    );
    expect(logged).not.toHaveBeenCalled();
  });
});
