"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Undo2 } from "lucide-react";
import type { FolioDetail } from "@ranza/folios";
import {
  Button,
  Fact,
  FactList,
  Field,
  FormError,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import {
  closeFolio,
  postCharge,
  postPayment,
  reverseLine,
  type FinanceOutcome,
} from "../../../server/finance";

/**
 * One Folio: what it is, what is on it, and the two things that can be done.
 *
 * A plain table rather than the DataTable kit. A Folio's lines are a ledger —
 * they are read in posting order and the order carries meaning, so sorting,
 * faceting and column hiding would each be a way to make it say something
 * untrue. The kit earns its place on a list somebody searches; this is not
 * one.
 *
 * Nothing here decides whether the viewer may do anything. The row-level
 * policies do, and this only reports what came back. `mayReverse` only hides
 * an action the policy would refuse — reversing asks its own permission
 * (ADR 0041), so somebody who may post a charge is not offered a button that
 * could only fail.
 */

function outcomeMessage(
  outcome: FinanceOutcome,
  invalid: string,
  refused: string,
): string | null {
  if (outcome === "invalid") return invalid;
  if (outcome === "refused") return refused;
  return null;
}

function ChargeForm({
  currency,
  folioId,
  locale,
}: {
  currency: string;
  folioId: string;
  locale: string;
}) {
  const t = useTranslations();
  const [outcome, act, pending] = useActionState<FinanceOutcome, FormData>(
    postCharge,
    "idle",
  );
  const message = outcomeMessage(
    outcome,
    t("amountInvalid"),
    t("chargeRefused"),
  );

  return (
    <form action={act} className="mt-6 grid gap-4">
      <h3 className="text-step-0 font-medium">{t("addCharge")}</h3>
      <input name="folio" type="hidden" value={folioId} />
      <input name="locale" type="hidden" value={locale} />
      <input name="currency" type="hidden" value={currency} />

      <div className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <Field htmlFor="charge-description" label={t("description")}>
          <Input
            autoComplete="off"
            id="charge-description"
            maxLength={200}
            name="description"
            required
          />
        </Field>
        <Field htmlFor="charge-amount" label={`${t("amount")} (${currency})`}>
          {/* inputMode="decimal" rather than type="number": a number input
              disagrees with itself about the decimal separator across locales,
              and silently drops what it cannot parse. The server decides what
              is an amount. */}
          <Input
            autoComplete="off"
            className="text-end tabular-nums"
            id="charge-amount"
            inputMode="decimal"
            name="amount"
            required
          />
        </Field>
        <Button disabled={pending} type="submit">
          {pending ? t("posting") : t("post")}
        </Button>
      </div>

      {message ? (
        <div aria-live="polite">
          <FormError>{message}</FormError>
        </div>
      ) : null}
    </form>
  );
}

function PaymentForm({
  currency,
  folioId,
  locale,
}: {
  currency: string;
  folioId: string;
  locale: string;
}) {
  const t = useTranslations();
  const [outcome, act, pending] = useActionState<FinanceOutcome, FormData>(
    postPayment,
    "idle",
  );
  const message = outcomeMessage(
    outcome,
    t("amountInvalid"),
    t("paymentRefused"),
  );

  return (
    <form action={act} className="mt-6 grid gap-4">
      <h3 className="text-step-0 font-medium">{t("addPayment")}</h3>
      <input name="folio" type="hidden" value={folioId} />
      <input name="locale" type="hidden" value={locale} />
      <input name="currency" type="hidden" value={currency} />

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem_10rem_auto] sm:items-end">
        <Field htmlFor="payment-description" label={t("description")}>
          <Input
            autoComplete="off"
            id="payment-description"
            maxLength={200}
            name="description"
            required
          />
        </Field>
        <Field htmlFor="payment-method" label={t("paymentMethod")}>
          <Select defaultValue="card" name="paymentMethod">
            <SelectTrigger id="payment-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">{t("paymentMethods.cash")}</SelectItem>
              <SelectItem value="card">{t("paymentMethods.card")}</SelectItem>
              <SelectItem value="bank_transfer">
                {t("paymentMethods.bank_transfer")}
              </SelectItem>
              <SelectItem value="other">{t("paymentMethods.other")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field htmlFor="payment-amount" label={`${t("amount")} (${currency})`}>
          <Input
            autoComplete="off"
            className="text-end tabular-nums"
            id="payment-amount"
            inputMode="decimal"
            name="amount"
            required
          />
        </Field>
        <Button disabled={pending} type="submit">
          {pending ? t("posting") : t("post")}
        </Button>
      </div>

      {message ? (
        <div aria-live="polite">
          <FormError>{message}</FormError>
        </div>
      ) : null}
    </form>
  );
}

function ReverseAction({ lineId, locale }: { lineId: string; locale: string }) {
  const t = useTranslations();
  const [outcome, act, pending] = useActionState<FinanceOutcome, FormData>(
    reverseLine,
    "idle",
  );
  const message = outcomeMessage(
    outcome,
    t("amountInvalid"),
    t("reverseRefused"),
  );

  return (
    <form action={act} className="grid justify-items-end gap-1.5">
      <input name="line" type="hidden" value={lineId} />
      <input name="locale" type="hidden" value={locale} />
      <div className="flex items-center justify-end gap-2">
        {/* The reason is required, not optional: taking money off a Guest's
            account is the kind of action blueprint 4.4 says must be explained,
            and the audit record keeps what is typed here. */}
        <Input
          aria-label={t("reverseReason")}
          className="h-8 w-40 text-step--1"
          maxLength={200}
          minLength={3}
          name="reason"
          placeholder={t("reverseReason")}
          required
        />
        <Button disabled={pending} size="sm" type="submit" variant="ghost">
          <Undo2 aria-hidden="true" className="size-4" />
          {pending ? t("reversing") : t("reverse")}
        </Button>
      </div>
      {message ? (
        <div aria-live="polite">
          <FormError>{message}</FormError>
        </div>
      ) : null}
    </form>
  );
}

function CloseAction({ folioId, locale }: { folioId: string; locale: string }) {
  const t = useTranslations();
  const [outcome, act, pending] = useActionState<FinanceOutcome, FormData>(
    closeFolio,
    "idle",
  );

  return (
    <form action={act} className="grid justify-items-end gap-1.5">
      <input name="folio" type="hidden" value={folioId} />
      <input name="locale" type="hidden" value={locale} />
      <Button disabled={pending} type="submit" variant="secondary">
        {pending ? t("closing") : t("closeFolio")}
      </Button>
      {outcome === "refused" ? (
        <div aria-live="polite">
          <FormError>{t("closeRefused")}</FormError>
        </div>
      ) : null}
    </form>
  );
}

export function FolioPanel({
  folio,
  locale,
  mayReverse,
  mayPostCharge = true,
  mayReverseCharge,
  mayPostPayment = false,
  mayReversePayment = false,
}: {
  folio: FolioDetail;
  locale: SupportedLocale;
  /** Backwards compatible alias for mayReverseCharge. */
  mayReverse?: boolean;
  mayPostCharge?: boolean;
  mayReverseCharge?: boolean;
  mayPostPayment?: boolean;
  mayReversePayment?: boolean;
}) {
  const t = useTranslations();
  const open = folio.status === "open";
  const canReverseCharge = mayReverseCharge ?? mayReverse ?? false;
  const canReversePayment = mayReversePayment ?? false;

  // A room night reads in the reader's language, for the night it is for,
  // rather than as the description the database wrote (ADR 0038) — and so
  // does its correction, which copies that description.
  const nights = new Map(
    folio.lines.flatMap((line) =>
      line.roomNightOf ? [[line.lineId, line.roomNightOf] as const] : [],
    ),
  );
  const described = (line: FolioDetail["lines"][number]): string => {
    const night =
      line.roomNightOf ??
      (line.reversesLineId ? nights.get(line.reversesLineId) : undefined);
    return night
      ? t("roomNightLine", {
          date: formatDate(new Date(`${night}T00:00:00Z`), locale, {
            month: "short",
            timeZone: "UTC",
          }),
        })
      : line.description;
  };

  return (
    <section className="mt-6">
      <FactList className="pt-0">
        <Fact label={t("guest")}>{folio.guestName || folio.unitName}</Fact>
        <Fact label={t("unit")}>{folio.unitName}</Fact>
        <Fact label={t("status")}>{t(`folioStatus.${folio.status}`)}</Fact>
        <Fact label={t("balance")}>
          <span className="tabular-nums">
            {formatMoney(folio.balanceMinor, folio.currency, locale)}
          </span>
        </Fact>
      </FactList>

      <Separator className="my-6" />

      <Table>
        <TableCaption>{t("folioLines")}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>{t("description")}</TableHead>
            <TableHead>{t("posted")}</TableHead>
            <TableHead className="text-end">{t("amount")}</TableHead>
            <TableHead className="text-end">
              <span className="sr-only">{t("action")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {folio.lines.length === 0 ? (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={4}>
                {t("noLines")}
              </TableCell>
            </TableRow>
          ) : (
            folio.lines.map((line) => (
              <TableRow key={line.lineId}>
                <TableCell>
                  <span
                    className={
                      line.reversed
                        ? "text-muted-foreground line-through"
                        : undefined
                    }
                  >
                    {described(line)}
                  </span>
                  {line.paymentMethod ? (
                    <span className="ms-2 rounded-xs border border-border px-1.5 py-0.5 text-step--2 text-muted-foreground">
                      {t(`paymentMethods.${line.paymentMethod}`)}
                    </span>
                  ) : null}
                  {/* The word as well as the strike-through, because a line
                      through text is the only carrier otherwise and it is
                      invisible to a screen reader (blueprint 18.5). */}
                  {line.reversed ? (
                    <span className="ms-2 text-step--1 text-muted-foreground">
                      {t("reversed")}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap text-step--1 text-muted-foreground">
                  <time dateTime={line.postedAt.toISOString()}>
                    {formatDate(line.postedAt, locale, {
                      hour: "2-digit",
                      // 24-hour in every language, as everywhere else.
                      hourCycle: "h23",
                      minute: "2-digit",
                    })}
                  </time>
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {formatMoney(line.amountMinor, folio.currency, locale)}
                </TableCell>
                <TableCell>
                  {open &&
                  !line.reversed &&
                  ((line.lineType === "charge" && canReverseCharge) ||
                    (line.lineType === "payment" && canReversePayment)) ? (
                    <ReverseAction lineId={line.lineId} locale={locale} />
                  ) : null}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {open ? (
        <>
          {mayPostCharge ? (
            <ChargeForm
              currency={folio.currency}
              folioId={folio.folioId}
              locale={locale}
            />
          ) : null}
          {mayPostPayment ? (
            <PaymentForm
              currency={folio.currency}
              folioId={folio.folioId}
              locale={locale}
            />
          ) : null}
          <Separator className="my-6" />
          {folio.stayInHouse ? (
            // Not a disabled button: nothing the reader can do here closes
            // it, and the reason is the useful part (FO-S5-01).
            <p className="text-step--1 text-muted-foreground">
              {t("folioInHouseNote")}
            </p>
          ) : (
            <CloseAction folioId={folio.folioId} locale={locale} />
          )}
        </>
      ) : (
        // A closed Folio offers nothing. Reopening is a blueprint 5.9 workflow
        // that is not built, and a disabled button for it would imply it is.
        <p className="mt-6 text-muted-foreground">{t("folioClosedNote")}</p>
      )}
    </section>
  );
}
