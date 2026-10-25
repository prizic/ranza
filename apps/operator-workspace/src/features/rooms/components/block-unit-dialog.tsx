"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { CalendarRange, Wrench } from "lucide-react";
import { formatDate, isSupportedLocale } from "@ranza/i18n";
import {
  ArrowButton,
  CancelButton,
  Dialog,
  DialogActions,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  DialogNotice,
  DialogSection,
  FormError,
  Input,
  StatusBadge,
  buttonVariants,
  dialogFrameClassName,
  fieldClassName,
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
  calendarHref,
  locale,
  mayBlock,
  open,
  onOpenChange,
  unit,
  roomName,
  hold,
  maintenanceHref,
  reportHref,
  today,
}: {
  /** The room calendar of this Property, which a `q` narrows to one room. */
  calendarHref: string;
  locale: string;
  /** Whether the viewer holds `accommodation.configure` here (RB-S3-09). */
  mayBlock: boolean;
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
  /** The Property's business date, which tells a late arrival from a coming one. */
  today: string;
}) {
  const t = useTranslations();
  const rp = useTranslations("roomsPage");

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
  // A room with a Guest in it is refused a block by the database, and a viewer
  // without `accommodation.configure` is refused either way: neither is offered
  // a form that fails after the reason is typed (CALENDAR-09, RB-S3-09).
  const occupied = state?.kind === "in_house";
  const readOnly = !isOutOfOrder && (occupied || !mayBlock);
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
        return state.arrivesOn < today
          ? rp("unitStateReservedLate", { date: day(state.arrivesOn) })
          : t("unitStateReserved", { date: day(state.arrivesOn) });
      case "free":
        return t("unitStateFree");
      default:
        return null;
    }
  })();
  const blockLabel = bed ? t("blockBed") : t("blockRoom");
  const unblockLabel = bed ? t("unblockBed") : t("unblockRoom");

  const heading = bed
    ? t("maintenance.bedInRoom", { bed: unit.name, room: roomName })
    : unit.name;
  const facts = [
    unit.building,
    unit.floor !== null ? t("floorNumber", { floor: unit.floor }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const reasonGiven = reason.trim().length >= 3;
  const reportLink = reportHref ? (
    <Link
      className={buttonVariants({
        className: "justify-self-start rounded-full",
        variant: "outline",
      })}
      href={reportHref}
      prefetch={false}
    >
      <Wrench aria-hidden="true" className="size-4" />
      {t("maintenance.reportProblem")}
    </Link>
  ) : null;

  const calendarLink = (
    <Link
      className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      href={`${calendarHref}&q=${encodeURIComponent(roomName ?? unit.name)}`}
      prefetch={false}
    >
      <CalendarRange aria-hidden="true" className="size-4" />
      {rp("showOnCalendar")}
    </Link>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogFrameClassName("small")}>
        {isOutOfOrder ? (
          <>
            <DialogMasthead
              art="/illustrations/dialogs/wrench.svg"
              eyebrow={t("maintenance.outOfOrder")}
              facts={facts}
              heading={heading}
            />
            <DialogBody simple>
              <DialogDescription className="sr-only">
                {t("maintenance.outOfOrder")}
              </DialogDescription>
              <div className="grid gap-2 text-sm">
                <StatusBadge
                  icon={Wrench}
                  label={t("maintenance.outOfOrder")}
                  tone="danger"
                />
                <p className="m-0 text-muted-foreground">
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
              {calendarLink}
            </DialogBody>
            <DialogActions>
              <DialogClose asChild>
                <CancelButton type="button">
                  {t("maintenance.close")}
                </CancelButton>
              </DialogClose>
              <Link
                className={buttonVariants({
                  className:
                    "h-13 rounded-full bg-foreground px-6 text-base font-semibold text-background hover:bg-foreground/90",
                })}
                href={maintenanceHref}
              >
                {t("navigation.maintenance")}
              </Link>
            </DialogActions>
          </>
        ) : readOnly ? (
          <>
            <DialogMasthead
              art="/illustrations/dialogs/lock-room.svg"
              eyebrow={rp("roomDetails")}
              facts={facts}
              heading={heading}
            />
            <DialogBody simple>
              <DialogDescription className="sr-only">
                {rp("roomDetails")}
              </DialogDescription>
              {tonight ? <DialogNotice>{tonight}</DialogNotice> : null}
              {isBlocked ? (
                <DialogSection title={t("blockReason")}>
                  <p className="m-0 text-sm">
                    {state?.kind === "blocked" ? state.reason : ""}
                  </p>
                </DialogSection>
              ) : null}
              <p className="m-0 text-sm text-muted-foreground">
                {occupied
                  ? rp("occupiedCannotBlock")
                  : rp("blockNeedsPermission", {
                      permission: t("staff.permissions.configureAccommodation"),
                    })}
                {reportHref ? ` ${rp("reportStillOpen")}` : null}
              </p>
              {reportLink}
              {calendarLink}
            </DialogBody>
            <DialogActions>
              <DialogClose asChild>
                <CancelButton type="button">
                  {t("maintenance.close")}
                </CancelButton>
              </DialogClose>
            </DialogActions>
          </>
        ) : isBlocked ? (
          <form action={unblockAct} className="grid">
            <DialogMasthead
              art="/illustrations/dialogs/unlock-room.svg"
              eyebrow={unblockLabel}
              facts={facts}
              heading={heading}
            />
            <DialogBody simple>
              <DialogDescription className="sr-only">
                {unblockLabel}
              </DialogDescription>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="unitId" value={unit.unitId} />

              <DialogSection title={t("blockReason")}>
                <p className="m-0 text-sm">
                  {state?.kind === "blocked" ? state.reason : ""}
                </p>
              </DialogSection>
              {reportLink}
              {calendarLink}

              {unblockOutcome.status !== "idle" &&
                unblockOutcome.status !== "done" && (
                  <div aria-live="polite">
                    <FormError>
                      {refusal(unblockOutcome, "unblockRefused")}
                    </FormError>
                  </div>
                )}
            </DialogBody>
            <DialogActions>
              <DialogClose asChild>
                <CancelButton disabled={unblockPending} type="button">
                  {t("maintenance.close")}
                </CancelButton>
              </DialogClose>
              <ArrowButton disabled={unblockPending} type="submit">
                {unblockPending ? t("unblockingBed") : unblockLabel}
              </ArrowButton>
            </DialogActions>
          </form>
        ) : (
          <form className="grid" onSubmit={submitWithoutReset(blockAct)}>
            <DialogMasthead
              art="/illustrations/dialogs/lock-room.svg"
              eyebrow={blockLabel}
              facts={facts}
              heading={heading}
            />
            <DialogBody simple>
              <DialogDescription className="sr-only">
                {blockLabel}
              </DialogDescription>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="unitId" value={unit.unitId} />

              {tonight ? <DialogNotice>{tonight}</DialogNotice> : null}
              {reportHref ? (
                <div className="grid gap-3 text-sm">
                  <p className="m-0 text-muted-foreground">
                    {t("reportInsteadOfBlock")}
                  </p>
                  {reportLink}
                </div>
              ) : null}
              {calendarLink}

              <DialogSection
                hint={`${t("blockReasonHint")} ${t("blockNotifiesNobody")}`}
                labelFor="reason"
                tag={{ label: t("dialogTagRequired"), required: true }}
                title={t("blockReason")}
              >
                <Input
                  aria-describedby="reason-hint"
                  className={fieldClassName}
                  id="reason"
                  maxLength={200}
                  minLength={3}
                  name="reason"
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t("blockReasonPlaceholder")}
                  required
                  value={reason}
                />
              </DialogSection>

              {blockOutcome.status !== "idle" &&
                blockOutcome.status !== "done" && (
                  <div aria-live="polite">
                    <FormError>
                      {refusal(blockOutcome, "blockRefused")}
                    </FormError>
                  </div>
                )}
            </DialogBody>
            <DialogActions hint={reasonGiven ? null : t("dialogHintReason")}>
              <DialogClose asChild>
                <CancelButton disabled={blockPending} type="button">
                  {t("maintenance.close")}
                </CancelButton>
              </DialogClose>
              <ArrowButton
                disabled={blockPending || !reasonGiven}
                type="submit"
              >
                {blockPending ? t("blockingBed") : blockLabel}
              </ArrowButton>
            </DialogActions>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
