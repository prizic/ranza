"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
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
} from "@ranza/ui";
import {
  blockUnit,
  unblockUnit,
  type BlockOutcome,
} from "../../../server/accommodation";
import type { UnitEntry } from "../../../server/viewer";

export function BlockUnitDialog({
  locale,
  open,
  onOpenChange,
  unit,
}: {
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: UnitEntry | null;
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

  useEffect(() => {
    if (blockOutcome.status === "done" || unblockOutcome.status === "done") {
      onOpenChange(false);
    }
  }, [blockOutcome.status, unblockOutcome.status, onOpenChange]);

  if (!unit) return null;

  const isBlocked = unit.status === "blocked";
  const state = unit.state;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {unit.name} &mdash; {isBlocked ? t("unblockBed") : t("blockBed")}
          </DialogTitle>
          <DialogDescription>
            {unit.building ? `${unit.building} • ` : ""}
            {unit.floor !== null ? t("floorNumber", { floor: unit.floor }) : ""}
          </DialogDescription>
        </DialogHeader>

        {isBlocked ? (
          <form action={unblockAct} className="space-y-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="unitId" value={unit.unitId} />

            {unblockOutcome.status !== "idle" &&
              unblockOutcome.status !== "done" && (
                <FormError>
                  {unblockOutcome.message ?? t("chargeRefused")}
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
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={unblockPending}
                >
                  {t("discardBooking")}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={unblockPending}>
                {unblockPending ? t("unblockingBed") : t("unblockBed")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form action={blockAct} className="space-y-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="unitId" value={unit.unitId} />

            {blockOutcome.status !== "idle" &&
              blockOutcome.status !== "done" && (
                <FormError>
                  {blockOutcome.message ?? t("chargeRefused")}
                </FormError>
              )}

            <Field htmlFor="reason" label={t("blockReason")}>
              <div>
                <Input
                  id="reason"
                  name="reason"
                  required
                  minLength={3}
                  maxLength={200}
                  placeholder="Maintenance / repair"
                />
                <p className="text-xs text-muted-foreground pt-1">
                  {t("blockReasonHint")}
                </p>
              </div>
            </Field>

            <DialogFooter className="pt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={blockPending}>
                  {t("discardBooking")}
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="destructive"
                disabled={blockPending}
              >
                {blockPending ? t("blockingBed") : t("blockBed")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
