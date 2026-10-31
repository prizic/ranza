"use server";

import { revalidatePath } from "next/cache";
import {
  PRICED_UNIT_TYPES,
  RatesInputError,
  RatesRefusedError,
  RatesStaleError,
  parsePriceKey,
  priceKey,
  type PriceChange,
} from "@ranza/rates";
import { isSupportedLocale } from "@ranza/i18n";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * Saving the Rates section of the Configuration screen (ADR 0038).
 *
 * The prices arrive as minor units the form has already converted, one field
 * per price named by `priceKey` - `bed` for a bed in any room, `bed:4` for a
 * bed in a room of four; an empty field clears that price. Whether the save
 * lands is the policies' decision, so nothing here checks a permission. What
 * this layer owns is turning each way a save can end into an outcome the form
 * words in the reader's language.
 */

export interface PricesOutcome {
  status: "idle" | "saved" | "unchanged" | "invalid" | "refused" | "stale";
  /** The price that was refused - `bed`, `bed:4` - when one was; null when the form itself was malformed. */
  key?: string | null;
  /** The version the next save names. */
  version?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINOR = /^\d{1,15}$/;

/** Matched by class and by name, as `./configuration` does, for a second copy of the module. */
function is<T extends Error>(
  error: unknown,
  type: new (...args: never[]) => T,
): error is T {
  return (
    error instanceof type ||
    (error instanceof Error && error.name === type.name)
  );
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "");
}

/** The fields that name a price rather than carry the form: a kind, with or without a size after it. */
const PRICE_FIELD = new RegExp(`^(?:${PRICED_UNIT_TYPES.join("|")})(?::|$)`);

/** Every price the form sends, as a change; null when one is not a whole number of minor units or names no price. */
function pricesOf(form: FormData): PriceChange[] | null {
  const changes: PriceChange[] = [];
  for (const key of form.keys()) {
    if (!PRICE_FIELD.test(key)) continue;
    const target = parsePriceKey(key);
    if (!target) return null;
    const value = text(form, key).trim();
    if (value === "") {
      changes.push({ ...target, amountMinor: null });
    } else if (MINOR.test(value)) {
      changes.push({ ...target, amountMinor: Number(value) });
    } else {
      return null;
    }
  }
  return changes;
}

export async function savePrices(
  _previous: PricesOutcome,
  form: FormData,
): Promise<PricesOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  const locale = text(form, "locale");
  const propertyId = text(form, "propertyId");
  const prices = pricesOf(form);
  if (!isSupportedLocale(locale) || !UUID.test(propertyId) || !prices) {
    return { status: "invalid", key: null };
  }

  try {
    const saved = await getComposition().rates.setPrices(
      viewer.userId,
      propertyId,
      { version: text(form, "version"), prices },
    );
    // The booking dialog quotes these, so every page that could show one is
    // read again.
    if (saved.status === "saved") revalidatePath(`/${locale}`, "layout");
    return { status: saved.status, version: saved.version };
  } catch (error: unknown) {
    if (is(error, RatesInputError)) {
      return {
        status: "invalid",
        key:
          error.unitType === null
            ? null
            : priceKey(error.unitType, error.roomCapacity),
      };
    }
    if (is(error, RatesStaleError) || is(error, RatesRefusedError)) {
      // Somebody else saved, or the permission went while the page was open:
      // the next read shows what is true now.
      revalidatePath(`/${locale}`, "layout");
      return { status: is(error, RatesStaleError) ? "stale" : "refused" };
    }
    throw error;
  }
}
