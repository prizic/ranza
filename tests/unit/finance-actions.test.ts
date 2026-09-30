/**
 * The Finance screen's form fields, and what a failure says (FO-S2-05,
 * FO-S9-04).
 *
 * The integration suite proves the module. This proves the action in front of
 * it: that an amount typed with an Arabic keyboard is parsed by the same rule
 * as every other money field in the Workspace, and that a failure the module
 * did not raise as a refusal is recorded rather than shown as one more
 * "refused" nobody hears about.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postCharge = vi.fn();
const postPayment = vi.fn();
const reverseLine = vi.fn();
const closeFolio = vi.fn();
const revalidatePath = vi.fn();

// The application resolves its own copy of next, so the mock names that copy.
vi.mock("../../apps/operator-workspace/node_modules/next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  currentViewer: async () => ({ userId: VIEWER }),
}));
vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({
    folios: { postCharge, postPayment, reverseLine, closeFolio },
  }),
}));

const VIEWER = "de000001-0000-4000-8000-000000000001";
const FOLIO = "de000007-0000-4000-8000-000000000001";
const LINE = "de000008-0000-4000-8000-000000000001";

const finance =
  await import("../../apps/operator-workspace/src/server/finance");
const { FolioAmountError, FolioWriteError } =
  await import("../../packages/ranza/folios/src");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const charge = (amount: string, currency = "TRY") =>
  form({
    locale: "ar",
    folio: FOLIO,
    description: "Minibar",
    currency,
    amount,
  });

const payment = (amount: string, paymentMethod = "card", currency = "TRY") =>
  form({
    locale: "ar",
    folio: FOLIO,
    description: "Front desk payment",
    paymentMethod,
    currency,
    amount,
  });

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const command of [postCharge, postPayment, reverseLine, closeFolio]) {
    command.mockReset().mockResolvedValue({});
  }
  revalidatePath.mockReset();
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  logged.mockRestore();
});

describe("an amount typed on the Finance screen (FO-S2-05)", () => {
  it.each([
    ["١٢٫٥", "TRY", 1250],
    ["١٢,٥٠", "TRY", 1250],
    ["۱۲۵", "JPY", 125],
    ["12.5", "TRY", 1250],
    ["1,250", "KWD", 1250],
  ])("%s %s is %i minor units", async (typed, currency, minor) => {
    await expect(
      finance.postCharge("idle", charge(typed, currency)),
    ).resolves.toBe("done");
    expect(postCharge).toHaveBeenCalledWith(VIEWER, {
      amountMinor: minor,
      description: "Minibar",
      folioId: FOLIO,
    });
  });

  it.each([
    ["12.505", "TRY"],
    ["12.5", "JPY"],
    ["12abc", "TRY"],
    ["", "TRY"],
  ])(
    "%s %s is not an amount, and nothing is posted",
    async (typed, currency) => {
      await expect(
        finance.postCharge("idle", charge(typed, currency)),
      ).resolves.toBe("invalid");
      expect(postCharge).not.toHaveBeenCalled();
    },
  );

  it("posts a payment with valid payment method", async () => {
    await expect(
      finance.postPayment("idle", payment("50", "card", "TRY")),
    ).resolves.toBe("done");
    expect(postPayment).toHaveBeenCalledWith(VIEWER, {
      amountMinor: 5000,
      description: "Front desk payment",
      folioId: FOLIO,
      paymentMethod: "card",
    });
  });

  it("rejects an invalid payment method", async () => {
    await expect(
      finance.postPayment("idle", payment("50", "bitcoin", "TRY")),
    ).resolves.toBe("invalid");
    expect(postPayment).not.toHaveBeenCalled();
  });
});

describe("what a failed action says (FO-S9-04)", () => {
  const commands = [
    ["postCharge", postCharge, () => finance.postCharge("idle", charge("5"))],
    [
      "postPayment",
      postPayment,
      () => finance.postPayment("idle", payment("5")),
    ],
    [
      "reverseLine",
      reverseLine,
      () =>
        finance.reverseLine(
          "idle",
          form({ locale: "en", line: LINE, reason: "Charged in error" }),
        ),
    ],
    [
      "closeFolio",
      closeFolio,
      () => finance.closeFolio("idle", form({ locale: "en", folio: FOLIO })),
    ],
  ] as const;

  for (const [name, command, act] of commands) {
    it(`${name}: a refusal is the answer, and is not recorded`, async () => {
      command.mockRejectedValue(new FolioWriteError("refused"));
      await expect(act()).resolves.toBe("refused");
      expect(logged).not.toHaveBeenCalled();
    });

    it(`${name}: anything else reads the same and is recorded`, async () => {
      const lost = new Error("Connection terminated unexpectedly");
      command.mockRejectedValue(lost);
      await expect(act()).resolves.toBe("refused");
      expect(logged).toHaveBeenCalledWith(
        `${name} failed unexpectedly`,
        expect.any(Object),
        lost,
      );
    });
  }

  it("an amount the viewer can fix is invalid, not refused", async () => {
    reverseLine.mockRejectedValue(new FolioAmountError("too short"));
    await expect(
      finance.reverseLine(
        "idle",
        form({ locale: "en", line: LINE, reason: "x" }),
      ),
    ).resolves.toBe("invalid");
    expect(logged).not.toHaveBeenCalled();
  });
});

describe("an id the form did not render", () => {
  it("is refused before the module, and is not an incident", async () => {
    await expect(
      finance.closeFolio("idle", form({ locale: "en", folio: "not-an-id" })),
    ).resolves.toBe("refused");
    await expect(
      finance.reverseLine(
        "idle",
        form({ locale: "en", line: "", reason: "Charged in error" }),
      ),
    ).resolves.toBe("refused");
    await expect(
      finance.postCharge(
        "idle",
        form({
          locale: "en",
          folio: "x",
          description: "M",
          currency: "TRY",
          amount: "5",
        }),
      ),
    ).resolves.toBe("refused");
    expect(closeFolio).not.toHaveBeenCalled();
    expect(reverseLine).not.toHaveBeenCalled();
    expect(postCharge).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });
});
