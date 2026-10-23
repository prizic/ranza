"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import type { SupportedLocale } from "@ranza/i18n";
import { Button } from "@ranza/ui";
import { fetchDepartures } from "../queries";
import { frontOfficeKeys, type Scope } from "../query-keys";
import { CheckOutDialog } from "./check-out-dialog";

/**
 * Checking an overdue Guest out from the Close the day checklist, so the next
 * thing that holds the day is one press away and the desk never leaves the page.
 *
 * The dialog reviews the Stay's bill, which is the Departures list's own row, so
 * it is read the way Departures reads it (`fetchDepartures`) and the same Stay
 * is found in it: a copy of the bill derived here would be a second answer to
 * what the Guest owes. Until the list has arrived the button is shown disabled,
 * in the place it will be; a Stay that is no longer on it has been checked out
 * by somebody else, and the page is refreshed past it.
 */
export function CloseDayCheckOut({
  locale,
  scope,
  stayId,
}: {
  locale: SupportedLocale;
  scope: Scope;
  stayId: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { data } = useQuery({
    queryKey: frontOfficeKeys.departures(scope, "due"),
    queryFn: () => fetchDepartures(scope.propertyId, "due"),
  });
  const departure = data?.find((candidate) => candidate.stayId === stayId);

  if (data && !departure) return null;
  if (!departure) {
    return (
      <Button disabled size="sm" type="button">
        <LogOut aria-hidden="true" />
        {t("checkOut")}
      </Button>
    );
  }
  return (
    <CheckOutDialog
      departure={departure}
      locale={locale}
      onDone={() => router.refresh()}
      propertyId={scope.propertyId}
    />
  );
}
