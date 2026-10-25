"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FolioDetail } from "@ranza/folios";
import { owedOnFolio } from "../../../lib/owed";
import {
  Fact,
  FactList,
  Separator,
  StatusBadge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import {
  formatDate,
  formatMoney,
  isolate,
  type SupportedLocale,
} from "@ranza/i18n";
import { cancelledLine, folioOverdueDays, nightsNote } from "../derive";
import {
  ChargeForm,
  CloseDialog,
  PaymentDialog,
  ReverseDialog,
  type FolioSubject,
} from "./folio-forms";

/**
 * One Folio: whose it is, what has been charged and paid, what is on it, and
 * the things that can be done.
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

function day(iso: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${iso}T00:00:00Z`), locale, {
    month: "short",
    timeZone: "UTC",
  });
}

export function FolioPanel({
  auditHref = null,
  folio,
  locale,
  mayOpenReservation = false,
  mayReverse,
  mayPostCharge = true,
  mayReverseCharge,
  mayPostPayment = false,
  mayReversePayment = false,
  propertyId,
  timeZone,
}: {
  /**
   * The Audit log narrowed to this Folio, for a viewer who may read it and
   * null for one who may not, so nobody is sent to a screen that turns them
   * away (AUDIT-03).
   */
  auditHref?: string | null;
  folio: FolioDetail;
  locale: SupportedLocale;
  /** The Property the Folio is at, for the link to its booking. */
  propertyId?: string;
  /** The Property's own, so a line is dated by the clock at its front desk. */
  timeZone: string;
  /** Whether the viewer reaches the Reservations screen at this Property. */
  mayOpenReservation?: boolean;
  /** Backwards compatible alias for mayReverseCharge. */
  mayReverse?: boolean;
  mayPostCharge?: boolean;
  mayReverseCharge?: boolean;
  mayPostPayment?: boolean;
  mayReversePayment?: boolean;
}) {
  const t = useTranslations();
  const f = useTranslations("finance");
  const open = folio.status === "open";
  const canReverseCharge = mayReverseCharge ?? mayReverse ?? false;
  const canReversePayment = mayReversePayment ?? false;

  const money = (minor: number) => formatMoney(minor, folio.currency, locale);
  const who = folio.guestName || folio.unitName;
  const subject: FolioSubject = {
    folioId: folio.folioId,
    currency: folio.currency,
    who,
    unit: folio.unitName,
  };
  const owed = owedOnFolio(folio);
  // What this role cannot do on an open Folio, said once under the lines so a
  // missing button is not mistaken for a broken one (FINANCE-11).
  const lacks = [
    ...(mayPostCharge ? [] : [f("lackAddCharge")]),
    ...(canReverseCharge || canReversePayment ? [] : [f("lackReverse")]),
  ];
  const overdue = folioOverdueDays(folio);
  const note = nightsNote(folio);

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

  const reservationHref =
    mayOpenReservation && propertyId && folio.reservationId
      ? `/${locale}/reservations?${new URLSearchParams({ property: propertyId, open: folio.reservationId })}`
      : null;

  return (
    <section className="mt-6">
      <h2 className="text-step-1 font-medium">
        <bdi>{who}</bdi>
        {folio.guestName ? (
          <span className="text-muted-foreground">
            {" · "}
            <bdi>{folio.unitName}</bdi>
          </span>
        ) : null}
      </h2>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-step--1 text-muted-foreground">
        {folio.reference ? (
          reservationHref ? (
            <Link
              className="font-medium text-primary hover:underline"
              href={reservationHref}
              prefetch={false}
            >
              {f("reservationLink", { reference: folio.reference })}
            </Link>
          ) : (
            <span>
              {t("reservation")} <bdi>{folio.reference}</bdi>
            </span>
          )
        ) : null}
        {auditHref ? (
          <Link
            className="font-medium text-primary hover:underline"
            data-history-link
            href={auditHref}
            prefetch={false}
          >
            {f("history")}
          </Link>
        ) : null}
        <span>
          {folio.endsOn
            ? f("stayDates", {
                from: day(folio.startsOn, locale),
                to: day(folio.endsOn, locale),
              })
            : f("stayFrom", { from: day(folio.startsOn, locale) })}
        </span>
        {overdue > 0 ? (
          <StatusBadge
            icon={Clock}
            label={t("overdueDays", { count: overdue })}
            tone="danger"
          />
        ) : null}
      </p>

      <FactList className="pt-6">
        <Fact label={t("status")}>{t(`folioStatus.${folio.status}`)}</Fact>
        <Fact label={f("charged")}>
          <span className="tabular-nums">{money(folio.chargedMinor)}</span>
        </Fact>
        <Fact label={f("paid")}>
          <span className="tabular-nums">{money(folio.paidMinor)}</span>
        </Fact>
        <Fact label={f("balanceNow")}>
          <span className="font-semibold tabular-nums">
            {money(folio.balanceMinor)}
          </span>
        </Fact>
        {folio.pendingNights > 0 ? (
          <>
            <Fact label={f("stillToCharge")}>
              <span className="tabular-nums">
                {f("pendingNights", {
                  count: folio.pendingNights,
                  amount: money(folio.pendingMinor),
                })}
              </span>
            </Fact>
            <Fact label={f("owesAtCheckOut")}>
              <span className="font-semibold tabular-nums">
                {money(owed.netMinor)}
              </span>
            </Fact>
          </>
        ) : null}
      </FactList>

      {note ? (
        <p
          className="mt-5 max-w-prose border-s-2 border-border ps-4 text-step--1 text-muted-foreground"
          data-testid="nights-note"
          role="status"
        >
          {note === "unpriced"
            ? f(mayOpenReservation ? "nightsUnpriced" : "nightsUnpricedAsk")
            : note === "none_yet"
              ? folio.lastClosedOn
                ? f("nightsNoneYetSince", {
                    closed: day(folio.lastClosedOn, locale),
                  })
                : f("nightsNoneYet")
              : f("nightsSoFar", { charged: money(folio.chargedMinor) })}
        </p>
      ) : null}

      <Separator className="my-6" />

      <h3 className="mb-2 text-step-0 font-medium">{t("folioLines")}</h3>
      <Table>
        <TableCaption className="sr-only">{t("folioLines")}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>{t("description")}</TableHead>
            <TableHead className="hidden sm:table-cell">
              {t("posted")}
            </TableHead>
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
            folio.lines.map((line) => {
              const cancelled = cancelledLine(line, folio.lines);
              const label = cancelled
                ? f("reversalOf", { description: described(cancelled) })
                : described(line);
              // A reversal of a room night copies its description, so its
              // reason is not kept on the line; any other reversal's
              // description is the reason that was typed.
              const reason =
                cancelled && !cancelled.roomNightOf ? line.description : null;
              const posted = formatDate(line.postedAt, locale, {
                hour: "2-digit",
                // 24-hour in every language, as everywhere else.
                hourCycle: "h23",
                minute: "2-digit",
                timeZone,
              });
              return (
                <TableRow key={line.lineId}>
                  <TableCell>
                    <span
                      className={
                        line.reversed
                          ? "text-muted-foreground line-through"
                          : undefined
                      }
                    >
                      {label}
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
                    {reason ? (
                      <span className="block text-step--1 text-muted-foreground">
                        {f("reversalReason", { reason: isolate(reason) })}
                      </span>
                    ) : null}
                    {/* On a phone the Posted column is gone, so the amount and
                        Reverse fit beside the description without a sideways
                        swipe (FINANCE-06); the time moves under it. */}
                    <span className="mt-0.5 block text-step--1 text-muted-foreground sm:hidden">
                      {posted}
                    </span>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-step--1 text-muted-foreground sm:table-cell">
                    <time dateTime={line.postedAt.toISOString()}>{posted}</time>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {money(line.amountMinor)}
                  </TableCell>
                  <TableCell className="text-end">
                    {open &&
                    !line.reversed &&
                    ((line.lineType === "charge" && canReverseCharge) ||
                      (line.lineType === "payment" && canReversePayment)) ? (
                      <ReverseDialog
                        describe={described(line)}
                        folio={subject}
                        line={line}
                        locale={locale}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      <p className="mt-3 max-w-prose text-step--1 text-muted-foreground">
        {f("correctionsNote")}
      </p>

      {open ? (
        <>
          {mayPostCharge ? (
            <ChargeForm folio={subject} locale={locale} />
          ) : null}
          {mayPostPayment ? (
            <PaymentDialog folio={subject} locale={locale} owed={owed} />
          ) : null}
          {lacks.length > 0 ? (
            <p
              className="mt-4 max-w-prose text-step--1 text-muted-foreground"
              data-testid="role-lacks-note"
            >
              {f("lackNote", { actions: lacks.join(", ") })}
            </p>
          ) : null}
          <Separator className="my-6" />
          {folio.stayInHouse ? (
            // Not a disabled button: nothing the reader can do here closes
            // it, and the reason is the useful part (FO-S5-01).
            <p className="text-step--1 text-muted-foreground">
              {t("folioInHouseNote")}
            </p>
          ) : (
            <CloseDialog
              balanceMinor={folio.balanceMinor}
              folio={subject}
              locale={locale}
            />
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
