"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import {
  ArrowButton,
  Button,
  CancelButton,
  ChoiceGroup,
  Dialog,
  DialogActions,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  DialogSection,
  FormError,
  StatusBadge,
  dialogFrameClassName,
} from "@ranza/ui";
import {
  setRoomAdmits,
  type RoomAdmitsOutcome,
} from "../../../server/accommodation";
import type { UnitEntry } from "../../../server/viewer";

/**
 * Whom a room admits, on its tile (RB-S5-14, RB-S5-15).
 *
 * A gendered room says so wherever it is shown, so the desk sees it before
 * booking somebody the room would refuse. Whoever may configure rooms presses
 * the mark to change it, for the room and every bed in it. A room for anyone
 * shows nothing at a hotel, where the question rarely comes up, and offers the
 * choice at a dormitory, where it is the first thing set (ADR 0057: the model
 * decides what a screen shows first, never the rule).
 *
 * Refused by the database while somebody booked or in house would no longer be
 * admitted (RB-S5-08); the dialog says what to do instead.
 */
export function RoomAdmits({
  locale,
  mayChange,
  offer,
  room,
}: {
  locale: string;
  /** Whether the viewer holds `accommodation.configure` here. */
  mayChange: boolean;
  /** Whether a room for anyone offers the choice: a dormitory's rooms do. */
  offer: boolean;
  room: UnitEntry;
}) {
  const t = useTranslations();
  const rp = useTranslations("roomsPage");
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(room.admits ?? "");
  const [outcome, act, pending] = useActionState<RoomAdmitsOutcome, FormData>(
    setRoomAdmits,
    { status: "idle" },
  );

  useEffect(() => {
    if (outcome.status === "done") setOpen(false);
  }, [outcome]);

  const label = t(`roomAdmits.${room.admits ?? "anyone"}`);

  if (!mayChange || (room.admits === null && !offer)) {
    return room.admits ? (
      <StatusBadge icon={Users} label={label} tone="neutral" />
    ) : null;
  }

  function openChanged(next: boolean) {
    if (next) setChoice(room.admits ?? "");
    setOpen(next);
  }

  return (
    <Dialog onOpenChange={openChanged} open={open}>
      <Button
        aria-label={rp("admitsChange", { room: room.name })}
        className="relative z-10 h-7 justify-self-start rounded-full px-2.5 text-xs font-medium"
        onClick={() => openChanged(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Users aria-hidden="true" className="size-3.5" />
        {label}
      </Button>
      <DialogContent className={dialogFrameClassName("small")}>
        <form action={act} className="grid">
          <DialogMasthead
            art="/illustrations/dialogs/lock-room.svg"
            eyebrow={rp("admitsTitle")}
            heading={rp("admitsHeading", { room: room.name })}
          />
          <DialogBody simple>
            <DialogDescription className="sr-only">
              {rp("admitsChangeHint")}
            </DialogDescription>
            <input name="locale" type="hidden" value={locale} />
            <input name="unitId" type="hidden" value={room.unitId} />
            <DialogSection
              hint={rp("admitsChangeHint")}
              title={rp("admitsTitle")}
              titleId={`admits-${room.unitId}`}
            >
              <ChoiceGroup
                labelledBy={`admits-${room.unitId}`}
                name="admits"
                onChange={setChoice}
                options={[
                  { label: t("roomAdmits.anyone"), value: "" },
                  { label: t("roomAdmits.female"), value: "female" },
                  { label: t("roomAdmits.male"), value: "male" },
                ]}
                value={choice}
              />
            </DialogSection>
            {outcome.status === "stillHeld" ||
            outcome.status === "invalid" ||
            outcome.status === "refused" ? (
              <div aria-live="polite">
                <FormError>
                  {outcome.status === "stillHeld"
                    ? rp("admitsStillHeld")
                    : rp("admitsRefused")}
                </FormError>
              </div>
            ) : null}
          </DialogBody>
          <DialogActions>
            <DialogClose asChild>
              <CancelButton disabled={pending} type="button">
                {t("maintenance.close")}
              </CancelButton>
            </DialogClose>
            <ArrowButton
              disabled={pending || choice === (room.admits ?? "")}
              type="submit"
            >
              {pending ? rp("admitsSaving") : rp("admitsSave")}
            </ArrowButton>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
