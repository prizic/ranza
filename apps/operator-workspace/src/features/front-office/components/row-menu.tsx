"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { BedDouble, MoreHorizontal, Receipt } from "lucide-react";
import { isolate, localizeHref, type SupportedLocale } from "@ranza/i18n";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ranza/ui";

/**
 * Where else a row's Guest can be looked at.
 *
 * Only destinations that exist and open on this Guest's own record: their
 * Folio when there is one, and the room map. It used to offer a reservation
 * page, a profile and an inventory bed map, none of which is built — the
 * profile opened the staff roster — and a menu of links that do not do what
 * they say is worse than a shorter one.
 */
export function FrontDeskRowMenu({
  folioId,
  guestName,
  locale,
}: {
  folioId: string | null;
  guestName: string;
  locale: SupportedLocale;
}) {
  const t = useTranslations();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("moreActionsFor", { guest: isolate(guestName) })}
          size="icon-sm"
          variant="ghost"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {folioId ? (
          <DropdownMenuItem asChild>
            <Link href={`${localizeHref(locale, "finance")}?folio=${folioId}`}>
              <Receipt className="size-4" />
              <span>{t("openFolio")}</span>
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={localizeHref(locale, "rooms")}>
            <BedDouble className="size-4" />
            <span>{t("showOnRoomMap")}</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
