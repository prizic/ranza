"use server";

import { revalidatePath } from "next/cache";
import { FolioAmountError, FolioWriteError } from "@ranza/folios";
import { isSupportedLocale } from "@ranza/i18n";
import { toMinorUnits } from "../lib/amount";
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
 * An amount is parsed by `lib/amount`, the one rule every money field in the
 * Workspace uses — Arabic-Indic digits included — rather than a copy of it
 * that drifts (FO-S2-05).
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
 * An id the Finance form rendered. Anything else is a hand-made post, refused
 * here rather than reaching `::uuid` and being logged as an incident.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What a failed write says. A refusal the module raised is the answer, not an
 * incident. Anything else — a lost connection, a schema that moved — is shown
 * the same way and recorded, as the front desk's commands do (FO-S9-04).
 */
function failed(
  command: string,
  subject: Record<string, string>,
  error: unknown,
): FinanceOutcome {
  if (error instanceof FolioAmountError) return "invalid";
  if (!(error instanceof FolioWriteError)) {
    console.error(`${command} failed unexpectedly`, subject, error);
  }
  return "refused";
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
  if (!UUID.test(folioId)) return "refused";
  const description = String(form.get("description") ?? "");
  // The currency is read from the form, which carries the Folio's as a hidden
  // input. It decides how many digits "12.5" means, so a caller that names
  // another rescales what is charged — the known gap FO-DIFF-01, not a
  // guarantee this code makes.
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
    return failed("postCharge", { folioId }, error);
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

  const lineId = String(form.get("line") ?? "");
  if (!UUID.test(lineId)) return "refused";
  try {
    await getComposition().folios.reverseLine(
      viewer.userId,
      lineId,
      String(form.get("reason") ?? ""),
    );
  } catch (error) {
    return failed("reverseLine", { lineId }, error);
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

  const folioId = String(form.get("folio") ?? "");
  if (!UUID.test(folioId)) return "refused";
  try {
    await getComposition().folios.closeFolio(viewer.userId, folioId);
  } catch (error) {
    return failed("closeFolio", { folioId }, error);
  }

  revalidatePath(`/${locale}/finance`);
  return "done";
}
