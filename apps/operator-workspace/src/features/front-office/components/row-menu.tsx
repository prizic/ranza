"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BedSingle,
  CalendarCheck,
  MoreHorizontal,
  Receipt,
  User,
} from "lucide-react";
import { isolate, type SupportedLocale } from "@ranza/i18n";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ranza/ui";

interface FrontDeskRowMenuProps {
  guestName: string;
  locale: SupportedLocale;
  reservationId: string | null;
  stayId: string | null;
  unitId: string | null;
}

export function FrontDeskRowMenu({
  guestName,
  locale,
  unitId,
}: FrontDeskRowMenuProps) {
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
        <DropdownMenuItem asChild>
          <Link href={`/${locale}/reservations`}>
            <CalendarCheck className="size-4" />
            <span>{t("reservationDetails")}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/${locale}/finance`}>
            <Receipt className="size-4" />
            <span>{t("openFolio")}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild disabled={!unitId}>
          {unitId ? (
            <Link href={`/${locale}/inventory`}>
              <BedSingle className="size-4" />
              <span>{t("showOnBedMap")}</span>
            </Link>
          ) : (
            <span className="flex items-center gap-2 opacity-50">
              <BedSingle className="size-4" />
              <span>{t("showOnBedMap")}</span>
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/${locale}/people`}>
            <User className="size-4" />
            <span>{t("profile")}</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
