import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@ranza/ui";

/**
 * New reservation, when there is no Unit to sell (RG-S3-04).
 *
 * Shown disabled rather than hidden: a desk that cannot find the button does
 * not know whether it is missing, moved or forbidden. The reason says what is
 * in the way, and whoever may manage rooms is given the way to fix it — for
 * anybody else the link would lead to controls the policies then refuse.
 */
export function NoBookableUnit({ roomsHref }: { roomsHref: string | null }) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <p className="text-step--1 text-muted-foreground" id="no-bookable-unit">
        {t("noBookableUnit")}
      </p>
      {roomsHref ? (
        <Button asChild size="sm" variant="outline">
          <Link href={roomsHref}>{t("openRooms")}</Link>
        </Button>
      ) : null}
      <Button aria-describedby="no-bookable-unit" disabled size="sm">
        <Plus aria-hidden="true" />
        {t("newReservation")}
      </Button>
    </div>
  );
}
