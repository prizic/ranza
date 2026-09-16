"use server";

import { revalidatePath } from "next/cache";
import { FolioAmountError } from "@ranza/folios";
import { isSupportedLocale } from "@ranza/i18n";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * The Finance screen's writes.
 *
 * Same funnel as every read (ADR 0007): the session is resolved here and the
 * module runs the work inside a request context. Nothing on this path asks
 * whether the viewer may do it — the row-level policies answer that, and an
 * application check in front of them would be the weaker of the two.
 *
 * Nothing here parses money either. The form sends what was typed and the
 * module decides whether it is an amount, because a second parser in front of
 * the first is a second set of rules to keep in step.
 */

/**
 * What the form shows afterwards.
 *
 * `refused` covers every reason the write did not happen except an amount the
 * viewer can correct: out of reach, the Folio is closed, the line is already
 * reversed, none of it exists. One outcome on purpose, because telling them
 * apart would confirm that a Folio the viewer cannot see is there.
 */
export type FinanceOutcome = "idle" | "done" | "invalid" | "refused";

/**
 * Minor units from what somebody typed into a text field.
 *
 * Deliberately strict rather than forgiving: `parseFloat` accepts "12abc" and
 * rounds "0.005" somewhere nobody chose, and both produce a charge that is
 * quietly not the one intended. A comma is accepted as the decimal separator
 * because Turkish and Arabic keyboards produce one, and there is no thousands
 * grouping to disambiguate it from within a single field.
 *
 * The exponent comes from the currency, not from a constant — JPY has no minor
 * unit and KWD has three, and a hardcoded 100 silently multiplies both wrong.
 */
function toMinorUnits(typed: string, currency: string): number | null {
  const normalized = typed.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const digits =
    new Intl.NumberFormat("en", {
      currency,
      style: "currency",
    }).resolvedOptions().maximumFractionDigits ?? 2;

  const [major, minor = ""] = normalized.split(".");
  if (minor.length > digits) return null;

  const scaled = `${major}${minor.padEnd(digits, "0")}`;
  const amount = Number(scaled);
  return Number.isSafeInteger(amount) ? amount : null;
}

export async function postCharge(
  _previous: FinanceOutcome,
  form: FormData,
): Promise<FinanceOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return "refused";

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "refused";

  const folioId = String(form.get("folio") ?? "");
  const description = String(form.get("description") ?? "");
  // The currency comes from the Folio the server rendered, not from the form's
  // own idea of one: it decides how many digits "12.5" means, and a caller
  // that could name it could change what was charged.
  const currency = String(form.get("currency") ?? "");
  const amountMinor = toMinorUnits(String(form.get("amount") ?? ""), currency);
  if (amountMinor === null) return "invalid";

  try {
    await getComposition().folios.postCharge(viewer.userId, {
      amountMinor,
      description,
      folioId,
    });
  } catch (error) {
    return error instanceof FolioAmountError ? "invalid" : "refused";
  }

  revalidatePath(`/${locale}/finance`);
  return "done";
}

export async function reverseLine(
  _previous: FinanceOutcome,
  form: FormData,
): Promise<FinanceOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return "refused";

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "refused";

  try {
    await getComposition().folios.reverseLine(
      viewer.userId,
      String(form.get("line") ?? ""),
      String(form.get("reason") ?? ""),
    );
  } catch (error) {
    return error instanceof FolioAmountError ? "invalid" : "refused";
  }

  revalidatePath(`/${locale}/finance`);
  return "done";
}

export async function closeFolio(
  _previous: FinanceOutcome,
  form: FormData,
): Promise<FinanceOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return "refused";

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "refused";

  try {
    await getComposition().folios.closeFolio(
      viewer.userId,
      String(form.get("folio") ?? ""),
    );
  } catch {
    return "refused";
  }

  revalidatePath(`/${locale}/finance`);
  return "done";
}
