"use server";

import { revalidatePath } from "next/cache";
import {
  FolioAmountError,
  FolioWriteError,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@ranza/folios";
import { isSupportedLocale } from "@ranza/i18n";
import { parseAmount, type AmountFault } from "../lib/amount";
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
 * Each outcome a person can correct has its own word, so the form can say what
 * to change and the fields keep what was typed (RANZ-54). `refused` covers
 * every reason the write did not happen that the viewer cannot correct: out of
 * reach, the Folio is closed, the line is already reversed, none of it exists.
 * One outcome on purpose, because telling them apart would confirm that a
 * Folio the viewer cannot see is there.
 */
export type FinanceOutcome =
  | "idle"
  | "done"
  | "refused"
  | "amountFormat"
  | "amountDecimals"
  | "amountSize"
  | "amountZero"
  | "descriptionRequired"
  | "descriptionTooLong"
  | "methodRequired"
  | "reasonTooShort"
  | "reasonTooLong";

/**
 * An id the Finance form rendered. Anything else is a hand-made post, refused
 * here rather than reaching `::uuid` and being logged as an incident.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DESCRIPTION_MAX = 200;
const REASON_MIN = 3;

/**
 * What a failed write says. A refusal the module raised is the answer, not an
 * incident. Anything else — a lost connection, a schema that moved — is shown
 * the same way and recorded, as the front desk's commands do (FO-S9-04).
 *
 * A Folio amount error here means a rule this file checks first was missed:
 * that is a defect in this file, so it is recorded like one.
 */
function failed(
  command: string,
  subject: Record<string, string>,
  error: unknown,
): FinanceOutcome {
  if (
    !(error instanceof FolioWriteError) ||
    error instanceof FolioAmountError
  ) {
    console.error(`${command} failed unexpectedly`, subject, error);
  }
  return "refused";
}

const AMOUNT_FAULTS: Record<AmountFault, FinanceOutcome> = {
  format: "amountFormat",
  decimals: "amountDecimals",
  size: "amountSize",
};

type Typed<T> = { ok: true; value: T } | { ok: false; outcome: FinanceOutcome };

/** The amount field, in the language of the screen it was typed on. */
function typedAmount(
  form: FormData,
  locale: string,
  currency: string,
): Typed<number> {
  const parsed = parseAmount(
    String(form.get("amount") ?? ""),
    currency,
    locale,
  );
  if (!parsed.ok) return { ok: false, outcome: AMOUNT_FAULTS[parsed.fault] };
  return parsed.minor > 0
    ? { ok: true, value: parsed.minor }
    : { ok: false, outcome: "amountZero" };
}

function typedDescription(form: FormData): Typed<string> {
  const description = String(form.get("description") ?? "").trim();
  if (description.length === 0) {
    return { ok: false, outcome: "descriptionRequired" };
  }
  return description.length > DESCRIPTION_MAX
    ? { ok: false, outcome: "descriptionTooLong" }
    : { ok: true, value: description };
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
  // The currency is read from the form, which carries the Folio's as a hidden
  // input. It decides how many digits "12.5" means, so a caller that names
  // another rescales what is charged — the known gap FO-DIFF-01, not a
  // guarantee this code makes.
  const currency = String(form.get("currency") ?? "");
  const description = typedDescription(form);
  if (!description.ok) return description.outcome;
  const amount = typedAmount(form, locale, currency);
  if (!amount.ok) return amount.outcome;

  try {
    await getComposition().folios.postCharge(viewer.userId, {
      amountMinor: amount.value,
      description: description.value,
      folioId,
    });
  } catch (error) {
    return failed("postCharge", { folioId }, error);
  }

  revalidatePath(`/${locale}/finance`);
  return "done";
}

export async function postPayment(
  _previous: FinanceOutcome,
  form: FormData,
): Promise<FinanceOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return "refused";

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "refused";

  const folioId = String(form.get("folio") ?? "");
  if (!UUID.test(folioId)) return "refused";
  const paymentMethod = String(form.get("paymentMethod") ?? "");
  if (!PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
    return "methodRequired";
  }
  const currency = String(form.get("currency") ?? "");
  const description = typedDescription(form);
  if (!description.ok) return description.outcome;
  const amount = typedAmount(form, locale, currency);
  if (!amount.ok) return amount.outcome;

  try {
    await getComposition().folios.postPayment(viewer.userId, {
      amountMinor: amount.value,
      description: description.value,
      folioId,
      paymentMethod: paymentMethod as PaymentMethod,
    });
  } catch (error) {
    return failed("postPayment", { folioId }, error);
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
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < REASON_MIN) return "reasonTooShort";
  if (reason.length > DESCRIPTION_MAX) return "reasonTooLong";
  try {
    await getComposition().folios.reverseLine(viewer.userId, lineId, reason);
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
