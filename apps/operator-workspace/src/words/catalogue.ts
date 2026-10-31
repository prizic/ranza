import type { OperatingModel } from "@ranza/core";
import { supportedLocales, type SupportedLocale } from "@ranza/i18n";
import { messages, type Messages } from "../messages";
import { dormitoryWords } from "./dormitory";
import { withOverlay } from "./overlay";

/**
 * A dormitory's catalogue in each language, built once when the module loads.
 * One object per language for the life of the process, because the client
 * keeps the catalogue it was handed by identity (`StableIntlProvider`), and a
 * catalogue that was a new object on every request would rebuild every table.
 */
const dormitory = Object.fromEntries(
  supportedLocales.map((locale) => [
    locale,
    withOverlay(messages[locale], dormitoryWords[locale]),
  ]),
) as Record<SupportedLocale, Messages>;

/** The words a Property's screens are read in (ADR 0057). */
export function catalogueFor(
  locale: SupportedLocale,
  model: OperatingModel | null,
): Messages {
  return model === "dormitory" ? dormitory[locale] : messages[locale];
}
