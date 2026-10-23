"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, Play, RotateCcw, XCircle } from "lucide-react";
import type {
  ServiceRequestItem,
  ServiceRequestStatus,
} from "@ranza/guest-services";
import {
  ArrowButton,
  Button,
  CancelButton,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  DialogSection,
  Input,
  Textarea,
  dialogFrameClassName,
  fieldClassName,
  textareaClassName,
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
  /** Told what every command came to, so a refusal outlives a row that leaves. */
  onOutcome: (status: ServiceRequestOutcome["status"]) => void;
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
  onOutcome,
  propertyId,
  request,
}: RequestActionsProps) {
  const t = useTranslations("guestExperience");
  const all = useTranslations();
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
      onOutcome(result.status);
      if (result.status === "done") onDone();
    });

  const closeDialogs = () => {
    setResolveOpen(false);
    setResolutionNotes("");
    setCancelOpen(false);
    setCancelReason("");
  };
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
      <Dialog
        open={resolveOpen}
        onOpenChange={(open) => {
          setResolveOpen(open);
          if (!open) {
            setOutcome("idle");
            onOutcome("idle");
          }
        }}
      >
        <DialogContent className={dialogFrameClassName("small")}>
          <DialogMasthead
            art="/illustrations/dialogs/bell.svg"
            eyebrow={t("resolve")}
            heading={`#${request.number} · ${request.title}`}
          />
          <DialogBody>
            <DialogDescription className="m-0 py-5 text-sm">
              {t("resolveConsequence")}
            </DialogDescription>
            <DialogSection
              labelFor={`resolve-notes-${request.id}`}
              tag={{ label: all("dialogTagOptional"), required: false }}
              title={t("resolutionNotes")}
            >
              <Textarea
                className={textareaClassName}
                id={`resolve-notes-${request.id}`}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder={t("resolutionNotesPlaceholder")}
                rows={3}
                value={resolutionNotes}
              />
            </DialogSection>
            <div aria-live="polite" className="py-5 empty:hidden">
              <RequestOutcome status={outcome} />
            </div>
          </DialogBody>
          <DialogActions>
            <CancelButton
              disabled={isPending}
              onClick={() => setResolveOpen(false)}
              type="button"
            >
              {t("close")}
            </CancelButton>
            <ArrowButton
              disabled={isPending}
              onClick={() =>
                move("resolved", resolutionNotes.trim() || null, closeDialogs)
              }
              type="button"
            >
              {t("resolve")}
            </ArrowButton>
          </DialogActions>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open);
          if (!open) {
            setOutcome("idle");
            onOutcome("idle");
          }
        }}
      >
        <DialogContent className={dialogFrameClassName("small")}>
          <DialogMasthead
            art="/illustrations/dialogs/bell.svg"
            eyebrow={t("cancelRequest")}
            heading={`#${request.number} · ${request.title}`}
          />
          <DialogBody>
            <DialogDescription className="m-0 py-5 text-sm">
              {t("cancelConsequence")}
            </DialogDescription>
            <DialogSection
              labelFor={`cancel-reason-${request.id}`}
              tag={{ label: all("dialogTagRequired"), required: true }}
              title={t("cancelReason")}
            >
              <Input
                className={fieldClassName}
                id={`cancel-reason-${request.id}`}
                maxLength={200}
                minLength={REASON_MIN}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t("cancelReasonPlaceholder")}
                value={cancelReason}
              />
            </DialogSection>
            <div aria-live="polite" className="py-5 empty:hidden">
              <RequestOutcome status={outcome} />
            </div>
          </DialogBody>
          <DialogActions hint={reasonValid ? null : t("reasonHintMissing")}>
            <CancelButton
              disabled={isPending}
              onClick={() => setCancelOpen(false)}
              type="button"
            >
              {t("keepRequest")}
            </CancelButton>
            <ArrowButton
              disabled={isPending || !reasonValid}
              onClick={() =>
                move("cancelled", cancelReason.trim(), closeDialogs)
              }
              tone="danger"
              type="button"
            >
              {t("cancelRequest")}
            </ArrowButton>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </div>
  );
}
