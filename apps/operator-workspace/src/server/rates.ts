"use server";

import { revalidatePath } from "next/cache";
import {
  PRICED_UNIT_TYPES,
  RatesInputError,
  RatesRefusedError,
  RatesStaleError,
  type PriceChange,
  type PricedUnitType,
} from "@ranza/rates";
import { isSupportedLocale } from "@ranza/i18n";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * Saving the Rates section of the Configuration screen (ADR 0038).
 *
 * The prices arrive as minor units the form has already converted, one field
 * per unit type; an empty field clears that type's price. Whether the save
 * lands is the policies' decision, so nothing here checks a permission. What
 * this layer owns is turning each way a save can end into an outcome the form
 * words in the reader's language.
 */

export interface PricesOutcome {
  status: "idle" | "saved" | "unchanged" | "invalid" | "refused" | "stale";
  /** The type whose price was refused, when one was. */
  unitType?: PricedUnitType | null;
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

/** Every type the form sends, as a change; null when one is not a whole number of minor units. */
function pricesOf(form: FormData): PriceChange[] | null {
  const changes: PriceChange[] = [];
  for (const unitType of PRICED_UNIT_TYPES) {
    if (!form.has(unitType)) continue;
    const value = text(form, unitType).trim();
    if (value === "") {
      changes.push({ unitType, amountMinor: null });
    } else if (MINOR.test(value)) {
      changes.push({ unitType, amountMinor: Number(value) });
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
    return { status: "invalid", unitType: null };
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
      return { status: "invalid", unitType: error.unitType };
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
