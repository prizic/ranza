"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, Play, RotateCcw, XCircle } from "lucide-react";
import type {
  ServiceRequestItem,
  ServiceRequestStatus,
} from "@ranza/guest-services";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@ranza/ui";
import {
  updateServiceRequestStatus,
  type ServiceRequestOutcome,
} from "../../../server/guest-services";
import { RequestOutcome } from "./request-outcome";

/** The database requires a cancellation reason of at least this many characters. */
const REASON_MIN = 3;

export interface RequestActionsProps {
  locale: string;
  propertyId: string;
  request: ServiceRequestItem;
}

/**
 * What can be done to one request, as buttons. Every command's answer is read:
 * a refusal keeps the dialog open with its reason, and what was typed is kept
 * (GX-03). Reopening goes where the lifecycle allows: a cancelled request to
 * New, a resolved one back to In progress (GX-02).
 */
export function RequestActions({
  locale,
  propertyId,
  request,
}: RequestActionsProps) {
  const t = useTranslations("guestExperience");
  const [isPending, startTransition] = useTransition();
  const [outcome, setOutcome] =
    useState<ServiceRequestOutcome["status"]>("idle");

  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const move = (
    status: ServiceRequestStatus,
    notes: string | null,
    onDone: () => void,
  ) =>
    startTransition(async () => {
      const result = await updateServiceRequestStatus(
        locale,
        propertyId,
        request.id,
        status,
        notes,
      );
      setOutcome(result.status);
      if (result.status === "done") onDone();
    });

  const closeDialogs = () => {
    setResolveOpen(false);
    setResolutionNotes("");
    setCancelOpen(false);
    setCancelReason("");
  };
  const dialogOpen = resolveOpen || cancelOpen;
  const reasonValid = cancelReason.trim().length >= REASON_MIN;
  const reopenTo = request.status === "cancelled" ? "new" : "in_progress";

  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {request.status === "new" && (
          <Button
            disabled={isPending}
            onClick={() => move("in_progress", null, () => undefined)}
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5 text-warning" />
            )}
            {t("markInProgress")}
          </Button>
        )}

        {(request.status === "new" || request.status === "in_progress") && (
          <>
            <Button
              disabled={isPending}
              onClick={() => setResolveOpen(true)}
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs border-success/40 text-success hover:bg-success-soft hover:text-success"
            >
              <CheckCircle2 className="size-3.5" />
              {t("resolve")}
            </Button>

            <Button
              disabled={isPending}
              onClick={() => setCancelOpen(true)}
              size="sm"
              variant="ghost"
              className="h-8 gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <XCircle className="size-3.5" />
              {t("cancelRequest")}
            </Button>
          </>
        )}

        {(request.status === "resolved" || request.status === "cancelled") && (
          <Button
            disabled={isPending}
            onClick={() => move(reopenTo, null, () => undefined)}
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            {t("reopen")}
          </Button>
        )}
      </div>
      {dialogOpen ? null : <RequestOutcome status={outcome} />}

      <Dialog
        open={resolveOpen}
        onOpenChange={(open) => {
          setResolveOpen(open);
          if (!open) setOutcome("idle");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("resolve")}</DialogTitle>
            <DialogDescription>
              #{request.number} · {request.title}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <Label htmlFor={`resolve-notes-${request.id}`}>
              {t("resolutionNotes")}
            </Label>
            <Textarea
              id={`resolve-notes-${request.id}`}
              placeholder={t("resolutionNotesPlaceholder")}
              rows={3}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
            <p className="text-step--1 text-muted-foreground">
              {t("resolveConsequence")}
            </p>
            <RequestOutcome status={outcome} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button disabled={isPending} type="button" variant="outline">
                {t("close")}
              </Button>
            </DialogClose>
            <Button
              disabled={isPending}
              onClick={() =>
                move("resolved", resolutionNotes.trim() || null, closeDialogs)
              }
              type="button"
              className="gap-1.5"
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              {t("resolve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open);
          if (!open) setOutcome("idle");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("cancelRequest")}</DialogTitle>
            <DialogDescription>
              #{request.number} · {request.title}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <Label htmlFor={`cancel-reason-${request.id}`}>
              {t("cancelReason")}
            </Label>
            <Input
              id={`cancel-reason-${request.id}`}
              minLength={REASON_MIN}
              maxLength={200}
              placeholder={t("cancelReasonPlaceholder")}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <p className="text-step--1 text-muted-foreground">
              {t("cancelConsequence")}
            </p>
            <RequestOutcome status={outcome} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button disabled={isPending} type="button" variant="outline">
                {t("keepRequest")}
              </Button>
            </DialogClose>
            <Button
              disabled={isPending || !reasonValid}
              onClick={() =>
                move("cancelled", cancelReason.trim(), closeDialogs)
              }
              type="button"
              variant="destructive"
              className="gap-1.5"
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              {t("cancelRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
