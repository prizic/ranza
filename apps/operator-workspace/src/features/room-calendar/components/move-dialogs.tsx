"use client";

import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ranza/ui";
import type { RoomCalendar } from "../../../server/viewer";
import { ChangeBookingDialog } from "../../front-office/components/change-booking-dialog";
import { ChangeDepartureDialog } from "../../front-office/components/change-departure-dialog";
import { MoveGuestDialog } from "../../front-office/components/move-guest-dialog";
import {
  describePeriod,
  MoveSummary,
} from "../../front-office/components/move-summary";
import { placeOf } from "../layout";
import {
  bookingConflicts,
  departureConflicts,
  guestConflicts,
  placeOfUnit,
  type MoveConflict,
  type MoveRequest,
} from "../move";

/** The words for what the calendar already knows against a move (RC-S3-04). */
export function useConflictText(): (conflict: MoveConflict) => string {
  const t = useTranslations("roomCalendar");
  return (conflict) => {
    switch (conflict.kind) {
      case "past":
        return t("moveConflict.past");
      case "notSellable":
        return t("moveConflict.notSellable", { unit: conflict.unit });
      case "outOfUse":
        return t(
          conflict.status === "blocked"
            ? "moveConflict.blocked"
            : "moveConflict.outOfService",
          { unit: conflict.unit },
        );
      case "booked":
        return t("moveConflict.booked", {
          guest: conflict.guest ?? t("noGuestRecorded"),
        });
      case "occupied":
        return t("moveConflict.occupied", {
          guest: conflict.guest ?? t("noGuestRecorded"),
        });
      case "leavesToday":
        return t("moveConflict.leavesToday");
      case "cannotMove":
        return t(
          conflict.why === "ended"
            ? "moveConflict.ended"
            : "moveConflict.noBooking",
        );
    }
  };
}

/**
 * The dialog a drop, or Move…, opens: the command's own, started on what was
 * proposed and showing what the calendar already knows against it. Nothing is
 * written until that dialog's save, and the database still decides then
 * (RC-S3-04, RC-S3-09).
 */
export function MoveDialogs({
  calendar,
  locale,
  onClose,
  request,
}: {
  calendar: RoomCalendar;
  locale: SupportedLocale;
  onClose: () => void;
  request: MoveRequest;
}) {
  const t = useTranslations("roomCalendar");
  const common = useTranslations();
  const text = useConflictText();
  const place = placeOf(request.entry);
  const guest = request.entry.bar.guestName ?? t("noGuestRecorded");
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  switch (request.kind) {
    case "booking": {
      const { bar, unit } = request.entry;
      return (
        <ChangeBookingDialog
          booking={{
            reservationId: bar.reservationId,
            reference: bar.reference,
            guestName: guest,
            unitLabel: place,
            unitId: unit.unitId,
            startsOn: bar.startsOn,
            endsOn: bar.endsOn,
            expectedArrival: bar.expectedArrival,
          }}
          locale={locale}
          move={{
            to: request.target,
            conflictsFor: (target) =>
              bookingConflicts(calendar, bar, target).map(text),
          }}
          onOpenChange={onOpenChange}
          open
        />
      );
    }
    case "guest": {
      const { bar } = request.entry;
      return (
        <MoveGuestDialog
          locale={locale}
          move={{
            unitId: request.unitId,
            conflictsFor: (unitId) =>
              guestConflicts(calendar, bar, unitId).map(text),
          }}
          onOpenChange={onOpenChange}
          open
          stay={{ stayId: bar.stayId, guestName: guest, unitLabel: place }}
        />
      );
    }
    case "departure": {
      const { bar, unit } = request.entry;
      return (
        <ChangeDepartureDialog
          locale={locale}
          move={{
            endsOn: request.endsOn,
            conflictsFor: (endsOn) =>
              departureConflicts(calendar, unit, bar, endsOn).map(text),
          }}
          onOpenChange={onOpenChange}
          open
          stay={{
            stayId: bar.stayId,
            reference: null,
            guestName: guest,
            unitLabel: place,
            startsOn: bar.arrivedOn,
            endsOn: bar.endsOn,
          }}
        />
      );
    }
    case "refused": {
      const { bar } = request.entry;
      const words = {
        openEnded: t("noEndDate"),
        nights: (count: number) => t("nights", { count }),
      };
      return (
        <Dialog onOpenChange={onOpenChange} open>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("cannotMoveTitle")}</DialogTitle>
              <DialogDescription>
                <bdi>{guest}</bdi>
              </DialogDescription>
            </DialogHeader>
            <MoveSummary
              conflicts={request.conflicts.map(text)}
              from={{
                place,
                period: describePeriod(bar.startsOn, bar.endsOn, locale, words),
              }}
              to={{
                place: placeOfUnit(calendar, request.target.unitId) ?? "—",
                period: describePeriod(
                  request.target.startsOn,
                  request.target.endsOn,
                  locale,
                  words,
                ),
              }}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {common("keepAsItWas")}
                </Button>
              </DialogClose>
              <Button disabled type="button">
                {t("confirmMove")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
  }
}
