"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { DepartedStay } from "@ranza/reservations";
import { formatDate, formatNumber, type SupportedLocale } from "@ranza/i18n";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import { frontOfficeKeys, type Scope } from "../query-keys";
import { unitLabel } from "../unit-label";

async function fetchDepartedToday(
  propertyId: string,
): Promise<readonly DepartedStay[]> {
  const response = await fetch(
    `/api/front-office/departed-today?property=${encodeURIComponent(propertyId)}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw Object.assign(new Error("departed today could not be read"), {
      status: response.status,
    });
  }
  const body = (await response.json()) as { departed: readonly DepartedStay[] };
  return body.departed;
}

/**
 * Who has already gone today, under the Guests still to go.
 *
 * Today's "checked out" figure counts these, so the figure opens a screen that
 * shows them (TD-S5-02). Read-only: a Stay that has ended has nothing left to
 * do from here. It polls with the list above it, since a check-out in the
 * dialog above moves a row from one to the other.
 */
export function LiveLeftToday({
  locale,
  scope,
  timeZone,
}: {
  locale: SupportedLocale;
  scope: Scope;
  /** The Property's own clock: a desk reads 14:05 whatever its laptop says. */
  timeZone: string;
}) {
  const t = useTranslations();
  const { data } = useQuery({
    queryKey: frontOfficeKeys.departedToday(scope),
    queryFn: () => fetchDepartedToday(scope.propertyId),
    refetchInterval: 30_000,
  });
  const rows = data ?? [];

  return (
    <section aria-labelledby="left-today" className="mt-8">
      <h2 className="flex items-center gap-2 text-step-0 font-semibold">
        <span id="left-today">{t("leftToday")}</span>
        <span
          className="rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground tabular-nums"
          data-testid="left-today-count"
        >
          {formatNumber(rows.length, locale)}
        </span>
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-step--1 text-muted-foreground">
          {t("nobodyLeftYet")}
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-3xl border bg-card shadow-low">
          <Table>
            <TableCaption className="sr-only">{t("leftToday")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("guest")}</TableHead>
                <TableHead>{t("reservation")}</TableHead>
                <TableHead>{t("roomAndBed")}</TableHead>
                <TableHead>{t("leftAt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.stayId}>
                  <TableCell className="font-medium">
                    <bdi>{row.guestName || t("noGuestRecorded")}</bdi>
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {row.reference ?? (
                      <span className="font-sans text-muted-foreground">
                        {t("walkIn")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <bdi>{unitLabel(row.roomName, row.unitName)}</bdi>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(new Date(row.departedAt), locale, {
                      year: undefined,
                      hour: "2-digit",
                      minute: "2-digit",
                      hourCycle: "h23",
                      timeZone,
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
