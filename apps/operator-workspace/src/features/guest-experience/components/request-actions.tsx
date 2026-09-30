"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, Play, RotateCcw, XCircle } from "lucide-react";
import type { ServiceRequestItem } from "@ranza/guest-services";
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
import { updateServiceRequestStatus } from "../../../server/guest-services";

export interface RequestActionsProps {
  locale: string;
  propertyId: string;
  request: ServiceRequestItem;
}

export function RequestActions({
  locale,
  propertyId,
  request,
}: RequestActionsProps) {
  const t = useTranslations("guestExperience");
  const [isPending, startTransition] = useTransition();

  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const handleStart = () => {
    startTransition(async () => {
      await updateServiceRequestStatus(
        locale,
        propertyId,
        request.id,
        "in_progress",
      );
    });
  };

  const handleResolve = () => {
    startTransition(async () => {
      await updateServiceRequestStatus(
        locale,
        propertyId,
        request.id,
        "resolved",
        resolutionNotes.trim() || null,
      );
      setResolveOpen(false);
      setResolutionNotes("");
    });
  };

  const handleCancel = () => {
    if (!cancelReason.trim()) return;
    startTransition(async () => {
      await updateServiceRequestStatus(
        locale,
        propertyId,
        request.id,
        "cancelled",
        cancelReason.trim(),
      );
      setCancelOpen(false);
      setCancelReason("");
    });
  };

  const handleReopen = () => {
    startTransition(async () => {
      await updateServiceRequestStatus(
        locale,
        propertyId,
        request.id,
        "in_progress",
      );
    });
  };

  return (
    <div className="flex items-center gap-1.5 justify-end">
      {request.status === "new" && (
        <Button
          disabled={isPending}
          onClick={handleStart}
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
            {t("cancel")}
          </Button>
        </>
      )}

      {(request.status === "resolved" || request.status === "cancelled") && (
        <Button
          disabled={isPending}
          onClick={handleReopen}
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

      {/* Resolve Dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
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
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button disabled={isPending} type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button
              disabled={isPending}
              onClick={handleResolve}
              type="button"
              className="gap-1.5"
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              {t("resolve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("cancel")}</DialogTitle>
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
              placeholder={t("cancelReasonPlaceholder")}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button disabled={isPending} type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button
              disabled={isPending || !cancelReason.trim()}
              onClick={handleCancel}
              type="button"
              variant="destructive"
              className="gap-1.5"
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              {t("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
