"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Undo2 } from "lucide-react";
import type { FolioLine, PaymentMethod } from "@ranza/folios";
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FormError,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

  useEffect(() => {
    if (last === "done") {
      setDescription("");
      setAmount("");
    }
  }, [last, run]);

  return (
    <form action={act} className="mt-6 grid gap-4">
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
            required
            value={amount}
          />
        </Field>
        <Button disabled={pending} type="submit">
          {pending ? t("posting") : t("post")}
        </Button>
      </div>
      <p className="text-step--1 text-muted-foreground">
        {f("chargeHint", { who: isolate(folio.who) })}
      </p>

      <Outcome
        currency={folio.currency}
        outcome={outcome}
        refused={f("whatCharge")}
      />
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
  owedMinor,
}: {
  folio: FolioSubject;
  locale: SupportedLocale;
  /** What the Guest owes now: the bill plus the nights check-out will charge. */
  owedMinor: number;
}) {
  const t = useTranslations();
  const f = useTranslations("finance");
  const { act, edited, outcome, pending, last, run } =
    useFinanceAction(postPayment);
  const [open, setOpen] = useState(false);
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
  const extra = typed !== null ? typed - Math.max(owedMinor, 0) : 0;
  const money = (minor: number) => formatMoney(minor, folio.currency, locale);
  const who = isolate(folio.who);
  const unit = isolate(folio.unit);

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
      <DialogContent>
        <form action={act} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("addPayment")}</DialogTitle>
            <DialogDescription>
              {f("paymentFor", { who, unit })}
            </DialogDescription>
          </DialogHeader>
          <input name="folio" type="hidden" value={folio.folioId} />
          <input name="locale" type="hidden" value={locale} />
          <input name="currency" type="hidden" value={folio.currency} />
          <input name="paymentMethod" type="hidden" value={method} />
          <input
            name="description"
            type="hidden"
            value={note.trim() || f("paymentDefaultDescription")}
          />

          <p className="text-step--1 text-muted-foreground">
            {owedMinor > 0
              ? f("owesNow", { amount: money(owedMinor) })
              : f("owesNothing")}
          </p>

          <Field
            htmlFor="payment-amount"
            label={`${t("amount")} (${folio.currency})`}
          >
            <Input
              autoComplete="off"
              className="text-end tabular-nums"
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
          </Field>

          <Field htmlFor="payment-method" label={t("paymentMethod")}>
            <Select
              onValueChange={(value) => {
                setMethod(value as PaymentMethod);
                edited();
              }}
              value={method}
            >
              <SelectTrigger className="w-full" id="payment-method">
                <SelectValue placeholder={f("chooseMethod")} />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`paymentMethods.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field htmlFor="payment-note" label={f("paymentNote")}>
            <Input
              autoComplete="off"
              id="payment-note"
              maxLength={200}
              onChange={(event) => {
                setNote(event.target.value);
                edited();
              }}
              placeholder={f("paymentNoteHint")}
              value={note}
            />
          </Field>

          <p
            className="rounded-lg border bg-muted/40 px-4 py-3 text-step--1"
            data-testid="payment-summary"
          >
            {typed !== null && method !== ""
              ? f("paymentSummary", {
                  amount: money(typed),
                  method: t(`paymentMethods.${method}`),
                  who,
                  unit,
                })
              : f("paymentSummaryIncomplete")}{" "}
            <span className="text-muted-foreground">{f("paymentRecord")}</span>
          </p>

          {extra > 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-step--1 text-amber-900">
              <Checkbox
                checked={extraConfirmed}
                id="payment-extra"
                onCheckedChange={(value) => setExtraConfirmed(value === true)}
              />
              <Label className="font-normal" htmlFor="payment-extra">
                {f("paymentExtra", {
                  extra: money(extra),
                  owed: money(Math.max(owedMinor, 0)),
                })}
              </Label>
            </div>
          ) : null}

          <Outcome
            currency={folio.currency}
            outcome={outcome}
            refused={f("whatPayment")}
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {f("cancel")}
              </Button>
            </DialogClose>
            <Button
              disabled={pending || (extra > 0 && !extraConfirmed)}
              type="submit"
            >
              {pending ? t("posting") : t("addPayment")}
            </Button>
          </DialogFooter>
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
      <DialogContent>
        <form action={act} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {isPayment ? f("reversePaymentTitle") : f("reverseChargeTitle")}
            </DialogTitle>
            <DialogDescription>
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
          </DialogHeader>
          <input name="line" type="hidden" value={line.lineId} />
          <input name="locale" type="hidden" value={locale} />

          <p className="rounded-lg border bg-muted/40 px-4 py-3 text-step--1">
            {isPayment
              ? f("reversePaymentEffect", { amount })
              : f("reverseChargeEffect", { amount })}
          </p>

          <Field htmlFor={`reverse-${line.lineId}`} label={t("reverseReason")}>
            <Input
              autoComplete="off"
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
          </Field>

          <Outcome
            currency={folio.currency}
            outcome={outcome}
            refused={f("whatReverse")}
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {f("cancel")}
              </Button>
            </DialogClose>
            <Button disabled={pending} type="submit" variant="destructive">
              {pending ? t("reversing") : t("reverse")}
            </Button>
          </DialogFooter>
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
      <DialogContent>
        <form action={act} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{f("closeTitle")}</DialogTitle>
            <DialogDescription>
              {f("closeSummary", {
                who: isolate(folio.who),
                unit: isolate(folio.unit),
              })}
            </DialogDescription>
          </DialogHeader>
          <input name="folio" type="hidden" value={folio.folioId} />
          <input name="locale" type="hidden" value={locale} />
          <p className="rounded-lg border bg-muted/40 px-4 py-3 text-step--1">
            {effect} {f("closeFinal")}
          </p>
          <Outcome
            currency={folio.currency}
            outcome={outcome}
            refused={f("whatClose")}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {f("cancel")}
              </Button>
            </DialogClose>
            <Button disabled={pending} type="submit">
              {pending ? t("closing") : t("closeFolio")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
