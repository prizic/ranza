"use client";

import {
  useActionState,
  useEffect,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Undo2 } from "lucide-react";
import type { FolioLine, PaymentMethod } from "@ranza/folios";
import type { Owed } from "../../../lib/owed";
import {
  ArrowButton,
  Button,
  CancelButton,
  ChoiceGroup,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  DialogNotice,
  DialogSection,
  DialogTrigger,
  Field,
  FormError,
  Input,
  TickRow,
  dialogFrameClassName,
  fieldClassName,
} from "@ranza/ui";
import {
  formatMoney,
  formatNumber,
  isolate,
  type SupportedLocale,
} from "@ranza/i18n";
import { minorDigits, parseAmount } from "../../../lib/amount";
import {
  closeFolio,
  postCharge,
  postPayment,
  reverseLine,
  type FinanceOutcome,
} from "../../../server/finance";

/**
 * The four things a clerk does to a Folio, each stating what it will do before
 * it is done (RANZ-55) and none of them losing what was typed when it is
 * refused (RANZ-54).
 *
 * Fields are controlled on purpose. A form action resets the uncontrolled
 * fields of its form when it returns, whether it succeeded or not, and a
 * refusal that empties the amount and the description makes the clerk type the
 * bill again (FIN-04). Only a posting that went through clears them.
 */

/** Which Folio an action is about, in the words a clerk would use. */
export interface FolioSubject {
  folioId: string;
  currency: string;
  /** The Guest, or the room when no name was recorded. */
  who: string;
  unit: string;
}

/**
 * A form action whose answer goes away once the person starts to change what
 * they typed: "Choose how it was paid" is true of the last attempt, not of the
 * form as it now stands, and left up it reads as the thing still wrong.
 */
function useFinanceAction(
  action: (previous: FinanceOutcome, form: FormData) => Promise<FinanceOutcome>,
) {
  const [answered, setAnswered] = useState(true);
  // The count is what lets a second success be told from the first: the same
  // word twice is not a change, and a dialog that closed on the first would
  // stay open on the second.
  const [state, act, pending] = useActionState<
    { outcome: FinanceOutcome; run: number },
    FormData
  >(
    async (previous, form) => {
      setAnswered(true);
      return {
        outcome: await action(previous.outcome, form),
        run: previous.run + 1,
      };
    },
    { outcome: "idle", run: 0 },
  );
  return {
    act,
    /** Call from every field's change handler. */
    edited: () => setAnswered(false),
    /** The last answer whether or not it is still shown, for what to do on success. */
    last: state.outcome,
    outcome: answered ? state.outcome : ("idle" as const),
    pending,
    run: state.run,
  };
}

/**
 * Says why a posting did not go through and what to do next. A refusal the
 * viewer cannot correct is one reason the module does not tell apart, so the
 * next step is to look at the Folio as it is now.
 */
function Outcome({
  currency,
  outcome,
  refused,
}: {
  currency: string;
  outcome: FinanceOutcome;
  /** What was not recorded, in the screen's words. */
  refused: string;
}) {
  const t = useTranslations("finance");
  const router = useRouter();
  if (outcome === "idle" || outcome === "done") return null;

  return (
    <div aria-live="polite" className="grid gap-2">
      <FormError>
        {outcome === "refused"
          ? t("refusedNext", { what: refused })
          : t(`outcome.${outcome}`, {
              digits: minorDigits(currency) ?? 2,
              currency,
            })}
      </FormError>
      {outcome === "refused" ? (
        <Button
          className="w-fit"
          onClick={() => router.refresh()}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("reload")}
        </Button>
      ) : null}
    </div>
  );
}

/** The amount as the screen's language writes it, ready to be typed back in. */
function typedBalance(
  minor: number,
  currency: string,
  locale: SupportedLocale,
): string {
  const digits = minorDigits(currency) ?? 2;
  return formatNumber(minor / 10 ** digits, locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    useGrouping: false,
  });
}

const AMOUNT_FAULT_MESSAGE = {
  format: "amountFormat",
  decimals: "amountDecimals",
  size: "amountSize",
} as const;

/**
 * Adding a charge puts money on a Guest's bill, so posting asks once, in a
 * dialog that names the Guest, the room and the amount and says what follows
 * (RANZ-55, FINANCE-04). The summary is also live under the fields, so a
 * mistyped 12500 for 1250 is read back before the question is asked.
 *
 * The dialog's button submits this form through its `form` attribute, so the
 * fields stay where they are and a refusal keeps what was typed (RANZ-54).
 */
export function ChargeForm({
  folio,
  locale,
}: {
  folio: FolioSubject;
  locale: SupportedLocale;
}) {
  const t = useTranslations();
  const f = useTranslations("finance");
  const { act, edited, outcome, pending, last, run } =
    useFinanceAction(postCharge);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const formId = `charge-form-${folio.folioId}`;

  useEffect(() => {
    if (run === 0) return;
    setConfirming(false);
    if (last === "done") {
      setDescription("");
      setAmount("");
    }
  }, [last, run]);

  const parsed = parseAmount(amount, folio.currency, locale);
  const typed = parsed.ok && parsed.minor > 0 ? parsed.minor : null;
  const ready = typed !== null && description.trim().length > 0;
  const money = (minor: number) => formatMoney(minor, folio.currency, locale);
  const who = isolate(folio.who);
  const unit = isolate(folio.unit);
  const summary = ready
    ? f("chargeSummary", { amount: money(typed), who, unit })
    : f("chargeSummaryIncomplete");
  // Enter in a field asks the same question the button does, instead of doing
  // nothing: a form with two fields and no submit button never submits itself.
  const askOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (ready) setConfirming(true);
  };

  return (
    <form action={act} className="mt-6 grid gap-4" id={formId}>
      <h3 className="text-step-0 font-medium">{t("addCharge")}</h3>
      <input name="folio" type="hidden" value={folio.folioId} />
      <input name="locale" type="hidden" value={locale} />
      <input name="currency" type="hidden" value={folio.currency} />

      <div className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <Field htmlFor="charge-description" label={t("description")}>
          <Input
            autoComplete="off"
            id="charge-description"
            maxLength={200}
            name="description"
            onChange={(event) => {
              setDescription(event.target.value);
              edited();
            }}
            onKeyDown={askOnEnter}
            required
            value={description}
          />
        </Field>
        <Field
          htmlFor="charge-amount"
          label={`${t("amount")} (${folio.currency})`}
        >
          {/* inputMode="decimal" rather than type="number": a number input
              disagrees with itself about the decimal separator across locales,
              and silently drops what it cannot parse. The server decides what
              is an amount, in the language of this screen. */}
          <Input
            autoComplete="off"
            className="text-end tabular-nums"
            id="charge-amount"
            inputMode="decimal"
            name="amount"
            onChange={(event) => {
              setAmount(event.target.value);
              edited();
            }}
            onKeyDown={askOnEnter}
            required
            value={amount}
          />
        </Field>
        <Button
          disabled={!ready}
          onClick={() => setConfirming(true)}
          type="button"
        >
          {t("post")}
        </Button>
      </div>
      {amount.trim() !== "" && !parsed.ok ? (
        <FormError>
          {f(`outcome.${AMOUNT_FAULT_MESSAGE[parsed.fault]}`, {
            digits: minorDigits(folio.currency) ?? 2,
            currency: folio.currency,
          })}
        </FormError>
      ) : null}
      <p
        className="text-step--1 text-muted-foreground"
        data-testid="charge-summary"
      >
        {summary} {f("chargeHint")}
      </p>

      <Outcome
        currency={folio.currency}
        outcome={outcome}
        refused={f("whatCharge")}
      />

      <Dialog onOpenChange={setConfirming} open={confirming}>
        <DialogContent className={dialogFrameClassName("small")}>
          <DialogMasthead
            art="/illustrations/dialogs/payment.svg"
            eyebrow={f("chargeConfirmTitle")}
            facts={unit}
            heading={typed === null ? who : money(typed)}
          />
          <DialogBody simple>
            <DialogDescription className="m-0 text-sm">
              {summary}
            </DialogDescription>
            <DialogNotice>{f("chargeConfirmEffect")}</DialogNotice>
          </DialogBody>
          <DialogActions>
            <CancelButton onClick={() => setConfirming(false)} type="button">
              {f("cancel")}
            </CancelButton>
            <ArrowButton
              autoFocus
              disabled={pending}
              form={formId}
              type="submit"
            >
              {pending ? t("posting") : f("postCharge")}
            </ArrowButton>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </form>
  );
}

const METHODS: readonly PaymentMethod[] = [
  "cash",
  "card",
  "bank_transfer",
  "other",
];

/**
 * Recording a payment: a dialog that starts from the common case — the
 * Guest paying what they owe — and says, above the button, exactly what will
 * be recorded. The method has no default, because a clerk who skips a field
 * should be asked, not recorded as having taken a card (FIN-06).
 *
 * An amount above what is owed is allowed once the clerk says so: a deposit
 * is real money. It is never the quiet default.
 */
export function PaymentDialog({
  folio,
  locale,
  owed,
}: {
  folio: FolioSubject;
  locale: SupportedLocale;
  /** What the Guest owes: the bill plus the nights check-out will charge. */
  owed: Owed;
}) {
  const t = useTranslations();
  const f = useTranslations("finance");
  const { act, edited, outcome, pending, last, run } =
    useFinanceAction(postPayment);
  const [open, setOpen] = useState(false);
  const owedMinor = owed.totalMinor;
  const initialAmount =
    owedMinor > 0 ? typedBalance(owedMinor, folio.currency, locale) : "";
  const [amount, setAmount] = useState(initialAmount);
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [note, setNote] = useState("");
  const [extraConfirmed, setExtraConfirmed] = useState(false);

  useEffect(() => {
    if (last !== "done") return;
    setOpen(false);
    setMethod("");
    setNote("");
    setExtraConfirmed(false);
  }, [last, run]);

  const reset = () => {
    setAmount(initialAmount);
    setMethod("");
    setNote("");
    setExtraConfirmed(false);
  };

  const parsed = parseAmount(amount, folio.currency, locale);
  const typed = parsed.ok && parsed.minor > 0 ? parsed.minor : null;
  const extra = typed !== null ? typed - owedMinor : 0;
  const money = (minor: number) => formatMoney(minor, folio.currency, locale);
  const who = isolate(folio.who);
  const unit = isolate(folio.unit);
  const complete = typed !== null && method !== "";
  const extraBlocked = extra > 0 && !extraConfirmed;

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button className="mt-6" type="button">
          {t("addPayment")}
        </Button>
      </DialogTrigger>
      <DialogContent className={dialogFrameClassName("medium")}>
        <form action={act} className="grid">
          <DialogMasthead
            art="/illustrations/dialogs/payment.svg"
            eyebrow={t("addPayment")}
            facts={unit}
            heading={who}
          />
          <input name="folio" type="hidden" value={folio.folioId} />
          <input name="locale" type="hidden" value={locale} />
          <input name="currency" type="hidden" value={folio.currency} />
          <input name="paymentMethod" type="hidden" value={method} />
          <input
            name="description"
            type="hidden"
            value={note.trim() || f("paymentDefaultDescription")}
          />

          <DialogBody>
            <DialogDescription className="m-0 py-5 text-sm">
              {owedMinor > 0
                ? f(owed.atCheckOutMinor > 0 ? "owesNowLater" : "owesNow", {
                    amount: money(owedMinor),
                  })
                : f("owesNothing")}
            </DialogDescription>

            <DialogSection
              labelFor="payment-amount"
              tag={{ label: t("dialogTagRequired"), required: true }}
              title={`${t("amount")} (${folio.currency})`}
            >
              <Input
                autoComplete="off"
                className={`${fieldClassName} text-end tabular-nums`}
                id="payment-amount"
                inputMode="decimal"
                name="amount"
                onChange={(event) => {
                  setAmount(event.target.value);
                  edited();
                }}
                required
                value={amount}
              />
            </DialogSection>

            <DialogSection
              tag={{ label: t("dialogTagRequired"), required: true }}
              title={t("paymentMethod")}
              titleId="payment-method"
            >
              <ChoiceGroup
                labelledBy="payment-method"
                name="paymentMethodChoice"
                onChange={(value) => {
                  setMethod(value as PaymentMethod);
                  edited();
                }}
                options={METHODS.map((value) => ({
                  label: t(`paymentMethods.${value}`),
                  value,
                }))}
                value={method}
              />
            </DialogSection>

            <DialogSection
              labelFor="payment-note"
              tag={{ label: t("dialogTagOptional"), required: false }}
              title={f("paymentNote")}
            >
              <Input
                autoComplete="off"
                className={fieldClassName}
                id="payment-note"
                maxLength={200}
                onChange={(event) => {
                  setNote(event.target.value);
                  edited();
                }}
                placeholder={f("paymentNoteHint")}
                value={note}
              />
            </DialogSection>

            <DialogSection>
              <div data-testid="payment-summary">
                <DialogNotice>
                  {complete
                    ? f("paymentSummary", {
                        amount: money(typed),
                        method: t(`paymentMethods.${method}`),
                        who,
                        unit,
                      })
                    : f("paymentSummaryIncomplete")}{" "}
                  <span className="text-muted-foreground">
                    {f("paymentRecord")}
                  </span>
                </DialogNotice>
              </div>
              {extra > 0 ? (
                <TickRow
                  checked={extraConfirmed}
                  id="payment-extra"
                  name="confirmExtra"
                  onCheckedChange={setExtraConfirmed}
                >
                  {f("paymentExtra", {
                    extra: money(extra),
                    owed: money(owedMinor),
                  })}
                </TickRow>
              ) : null}
            </DialogSection>

            <div className="py-5 empty:hidden">
              <Outcome
                currency={folio.currency}
                outcome={outcome}
                refused={f("whatPayment")}
              />
            </div>
          </DialogBody>

          <DialogActions
            hint={
              !complete
                ? f("paymentHintMissing")
                : extraBlocked
                  ? f("paymentHintExtra")
                  : null
            }
          >
            <CancelButton onClick={() => setOpen(false)} type="button">
              {f("cancel")}
            </CancelButton>
            <ArrowButton
              disabled={pending || !complete || extraBlocked}
              type="submit"
            >
              {pending ? t("posting") : t("addPayment")}
            </ArrowButton>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Reversing a line. The original stays on the Folio, marked reversed, and a
 * line with the opposite amount joins it, so the dialog says that, and says
 * what it does to the balance, before the reason is even typed.
 */
export function ReverseDialog({
  describe,
  folio,
  line,
  locale,
}: {
  /** The line's description as the Folio shows it. */
  describe: string;
  folio: FolioSubject;
  line: Pick<
    FolioLine,
    "amountMinor" | "lineId" | "lineType" | "paymentMethod"
  >;
  locale: SupportedLocale;
}) {
  const t = useTranslations();
  const f = useTranslations("finance");
  const { act, edited, outcome, pending, last, run } =
    useFinanceAction(reverseLine);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (last !== "done") return;
    setOpen(false);
    setReason("");
  }, [last, run]);

  const isPayment = line.lineType === "payment";
  const amount = formatMoney(
    Math.abs(line.amountMinor),
    folio.currency,
    locale,
  );
  const reasonGiven = reason.trim().length >= 3;

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReason("");
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="ghost">
          <Undo2 aria-hidden="true" className="size-4" />
          {t("reverse")}
        </Button>
      </DialogTrigger>
      <DialogContent className={dialogFrameClassName("medium")}>
        <form action={act} className="grid">
          <DialogMasthead
            art="/illustrations/dialogs/reverse.svg"
            eyebrow={
              isPayment ? f("reversePaymentTitle") : f("reverseChargeTitle")
            }
            heading={amount}
          />
          <input name="line" type="hidden" value={line.lineId} />
          <input name="locale" type="hidden" value={locale} />

          <DialogBody>
            <DialogDescription className="m-0 py-5 text-sm">
              {isPayment
                ? f("reversePaymentSummary", {
                    amount,
                    method: line.paymentMethod
                      ? t(`paymentMethods.${line.paymentMethod}`)
                      : "",
                    who: isolate(folio.who),
                    unit: isolate(folio.unit),
                  })
                : f("reverseChargeSummary", {
                    amount,
                    description: isolate(describe),
                    who: isolate(folio.who),
                    unit: isolate(folio.unit),
                  })}
            </DialogDescription>

            <DialogSection>
              <DialogNotice>
                {isPayment
                  ? f("reversePaymentEffect", { amount })
                  : f("reverseChargeEffect", { amount })}
              </DialogNotice>
            </DialogSection>

            <DialogSection
              labelFor={`reverse-${line.lineId}`}
              tag={{ label: t("dialogTagRequired"), required: true }}
              title={t("reverseReason")}
            >
              <Input
                autoComplete="off"
                className={fieldClassName}
                id={`reverse-${line.lineId}`}
                maxLength={200}
                minLength={3}
                name="reason"
                onChange={(event) => {
                  setReason(event.target.value);
                  edited();
                }}
                required
                value={reason}
              />
            </DialogSection>

            <div className="py-5 empty:hidden">
              <Outcome
                currency={folio.currency}
                outcome={outcome}
                refused={f("whatReverse")}
              />
            </div>
          </DialogBody>

          <DialogActions hint={reasonGiven ? null : f("reverseHintMissing")}>
            <CancelButton onClick={() => setOpen(false)} type="button">
              {f("cancel")}
            </CancelButton>
            <ArrowButton
              disabled={pending || !reasonGiven}
              tone="danger"
              type="submit"
            >
              {pending ? t("reversing") : t("reverse")}
            </ArrowButton>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Closing a Folio. It cannot be reopened and closing is not settling, so the
 * dialog says what the Folio is closed on: a balance left on it stays left.
 */
export function CloseDialog({
  balanceMinor,
  folio,
  locale,
}: {
  balanceMinor: number;
  folio: FolioSubject;
  locale: SupportedLocale;
}) {
  const t = useTranslations();
  const f = useTranslations("finance");
  const { act, outcome, pending, last, run } = useFinanceAction(closeFolio);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (last === "done") setOpen(false);
  }, [last, run]);

  const balance = formatMoney(balanceMinor, folio.currency, locale);
  const settled = balanceMinor === 0;
  const effect: ReactNode = settled
    ? f("closeSettled")
    : balanceMinor > 0
      ? f("closeOwing", { amount: balance })
      : f("closeCredit", { amount: balance });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          {t("closeFolio")}
        </Button>
      </DialogTrigger>
      <DialogContent className={dialogFrameClassName("small")}>
        <form action={act} className="grid">
          <DialogMasthead
            art="/illustrations/dialogs/payment.svg"
            eyebrow={f("closeTitle")}
            facts={isolate(folio.unit)}
            heading={isolate(folio.who)}
          />
          <input name="folio" type="hidden" value={folio.folioId} />
          <input name="locale" type="hidden" value={locale} />
          <DialogBody simple>
            <DialogDescription className="m-0 text-sm">
              {f("closeSummary", {
                who: isolate(folio.who),
                unit: isolate(folio.unit),
              })}
            </DialogDescription>
            <DialogNotice>
              {effect} {f("closeFinal")}
            </DialogNotice>
            <Outcome
              currency={folio.currency}
              outcome={outcome}
              refused={f("whatClose")}
            />
          </DialogBody>
          <DialogActions>
            <CancelButton onClick={() => setOpen(false)} type="button">
              {f("cancel")}
            </CancelButton>
            <ArrowButton disabled={pending} type="submit">
              {pending ? t("closing") : t("closeFolio")}
            </ArrowButton>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
