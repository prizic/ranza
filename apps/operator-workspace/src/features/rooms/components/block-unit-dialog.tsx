"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Wrench } from "lucide-react";
import { formatDate, isSupportedLocale } from "@ranza/i18n";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FormError,
  Input,
  StatusBadge,
  buttonVariants,
} from "@ranza/ui";
import {
  blockUnit,
  unblockUnit,
  type BlockOutcome,
} from "../../../server/accommodation";
import type { UnitEntry, UnitHold } from "../../../server/viewer";
import { submitWithoutReset } from "../../../lib/submit-without-reset";

/**
 * One Unit, from Rooms. Something wrong with it is a problem to report, which
 * tells maintenance and can hold the room out of order in the same step
 * (MT-S1-24); a block only keeps it from being sold and tells nobody
 * (RANZ-66). So reporting comes first when the viewer may, and blocking says
 * what it is. Out of order, the request that holds it is shown instead:
 * blocking is not offered then, a Unit is blocked from available only
 * (MT-S2-08).
 */
export function BlockUnitDialog({
  locale,
  open,
  onOpenChange,
  unit,
  roomName,
  hold,
  maintenanceHref,
  reportHref,
}: {
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: UnitEntry | null;
  /** The room a bed belongs to; null when the Unit is a whole room. */
  roomName: string | null;
  /** The request holding this Unit out of order, or its room. */
  hold: UnitHold | null;
  maintenanceHref: string;
  /** Null when the viewer may not report, or the Property has no maintenance. */
  reportHref: string | null;
}) {
  const t = useTranslations();

  const [blockOutcome, blockAct, blockPending] = useActionState<
    BlockOutcome,
    FormData
  >(blockUnit, { status: "idle" });

  const [unblockOutcome, unblockAct, unblockPending] = useActionState<
    BlockOutcome,
    FormData
  >(unblockUnit, { status: "idle" });

  // Kept by the dialog and not by the form: React empties an uncontrolled
  // field after every answer, and a refused block must not lose its reason.
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (blockOutcome.status === "done" || unblockOutcome.status === "done") {
      setReason("");
      onOpenChange(false);
    }
  }, [blockOutcome.status, unblockOutcome.status, onOpenChange]);

  if (!unit) return null;

  const isBlocked = unit.status === "blocked";
  const isOutOfOrder = unit.state?.kind === "out_of_service";
  const state = unit.state;
  const bed = roomName !== null;
  const refusal = (
    outcome: BlockOutcome,
    refused: "blockRefused" | "unblockRefused",
  ) =>
    outcome.status === "occupied"
      ? t("blockOccupied")
      : outcome.status === "invalid"
        ? t("blockInvalid")
        : t(refused);
  const tonight = (() => {
    const day = (iso: string) =>
      isSupportedLocale(locale)
        ? formatDate(new Date(`${iso}T12:00:00Z`), locale, { timeZone: "UTC" })
        : iso;
    switch (state?.kind) {
      case "in_house":
        return t("unitStateInHouse", { guest: state.guestName });
      case "reserved":
        return t("unitStateReserved", { date: day(state.arrivesOn) });
      case "free":
        return t("unitStateFree");
      default:
        return null;
    }
  })();
  const blockLabel = bed ? t("blockBed") : t("blockRoom");
  const unblockLabel = bed ? t("unblockBed") : t("unblockRoom");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {bed
              ? t("maintenance.bedInRoom", { bed: unit.name, room: roomName })
              : unit.name}
          </DialogTitle>
          <DialogDescription>
            {unit.building ? `${unit.building} • ` : ""}
            {unit.floor !== null ? t("floorNumber", { floor: unit.floor }) : ""}
          </DialogDescription>
        </DialogHeader>

        {isOutOfOrder ? (
          <div className="space-y-4">
            <div className="grid gap-2 rounded-md border bg-muted/40 p-3 text-sm">
              <StatusBadge
                icon={Wrench}
                label={t("maintenance.outOfOrder")}
                tone="danger"
              />
              <p className="text-muted-foreground">
                {hold
                  ? t("maintenance.reference", { number: hold.number })
                  : null}
                {hold?.expectedBackOn && isSupportedLocale(locale)
                  ? ` · ${t("maintenance.backOn", {
                      // A calendar day, read at noon UTC so no reader's own
                      // timezone moves it.
                      date: formatDate(
                        new Date(`${hold.expectedBackOn}T12:00:00Z`),
                        locale,
                        { timeZone: "UTC" },
                      ),
                    })}`
                  : null}
              </p>
            </div>
            <DialogFooter className="pt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t("maintenance.close")}
                </Button>
              </DialogClose>
              <Link className={buttonVariants()} href={maintenanceHref}>
                {t("navigation.maintenance")}
              </Link>
            </DialogFooter>
          </div>
        ) : isBlocked ? (
          <form action={unblockAct} className="space-y-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="unitId" value={unit.unitId} />

            {unblockOutcome.status !== "idle" &&
              unblockOutcome.status !== "done" && (
                <FormError>
                  {refusal(unblockOutcome, "unblockRefused")}
                </FormError>
              )}

            <div className="rounded-md border p-3 text-sm bg-muted/40">
              <span className="font-medium text-foreground">
                {t("blockReason")}:
              </span>{" "}
              <span className="text-muted-foreground">
                {state?.kind === "blocked" ? state.reason : ""}
              </span>
            </div>

            <DialogFooter className="pt-2">
              {reportHref ? (
                <Link
                  className={buttonVariants({ variant: "outline" })}
                  href={reportHref}
                  prefetch={false}
                >
                  <Wrench aria-hidden="true" className="size-4" />
                  {t("maintenance.reportProblem")}
                </Link>
              ) : null}
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={unblockPending}
                >
                  {t("maintenance.close")}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={unblockPending}>
                {unblockPending ? t("unblockingBed") : unblockLabel}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-5">
            {tonight ? (
              <p className="text-sm font-medium text-foreground">{tonight}</p>
            ) : null}
            {reportHref ? (
              <div className="grid gap-3 rounded-md border bg-muted/40 p-3 text-sm">
                <p className="text-muted-foreground">
                  {t("reportInsteadOfBlock")}
                </p>
                <Link
                  className={buttonVariants({
                    className: "justify-self-start",
                  })}
                  href={reportHref}
                  prefetch={false}
                >
                  <Wrench aria-hidden="true" className="size-4" />
                  {t("maintenance.reportProblem")}
                </Link>
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={submitWithoutReset(blockAct)}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="unitId" value={unit.unitId} />

              {blockOutcome.status !== "idle" &&
                blockOutcome.status !== "done" && (
                  <FormError>{refusal(blockOutcome, "blockRefused")}</FormError>
                )}

              <Field htmlFor="reason" label={t("blockReason")}>
                <div>
                  <Input
                    id="reason"
                    name="reason"
                    onChange={(event) => setReason(event.target.value)}
                    required
                    value={reason}
                    minLength={3}
                    maxLength={200}
                    placeholder={t("blockReasonPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground pt-1">
                    {t("blockReasonHint")} {t("blockNotifiesNobody")}
                  </p>
                </div>
              </Field>

              <DialogFooter className="pt-2">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={blockPending}
                  >
                    {t("maintenance.close")}
                  </Button>
                </DialogClose>
                <Button type="submit" variant="outline" disabled={blockPending}>
                  {blockPending ? t("blockingBed") : blockLabel}
                </Button>
              </DialogFooter>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
