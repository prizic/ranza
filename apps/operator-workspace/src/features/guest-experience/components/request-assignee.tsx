"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import type {
  ServiceRequestItem,
  ServiceRequestStaff,
} from "@ranza/guest-services";
import { isolate } from "@ranza/i18n";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ranza/ui";
import {
  assignServiceRequest,
  type ServiceRequestOutcome,
} from "../../../server/guest-services";
import { staffName } from "../../../lib/staff-name";

/**
 * Who has a request. A reader who may manage requests chooses from the staff
 * who can take them, or takes it with one press; anybody else reads the name.
 * A person is shown by name, never by address (GX-01).
 */
export function RequestAssignee({
  locale,
  onOutcome,
  propertyId,
  request,
  staff,
  viewerId,
  mayManage,
}: {
  locale: string;
  /** Told what every command came to, so a refusal outlives a row that leaves. */
  onOutcome: (status: ServiceRequestOutcome["status"]) => void;
  propertyId: string;
  request: ServiceRequestItem;
  staff: readonly ServiceRequestStaff[];
  viewerId: string;
  mayManage: boolean;
}) {
  const t = useTranslations("guestExperience");
  const [pending, startTransition] = useTransition();

  const closed =
    request.status === "resolved" || request.status === "cancelled";
  const name = request.assignedToUserId
    ? isolate(staffName(request.assignedToName, t("unassigned")))
    : t("unassigned");

  if (!mayManage || closed) {
    return (
      <span
        className={
          request.assignedToUserId ? "text-sm" : "text-sm text-muted-foreground"
        }
      >
        {name}
      </span>
    );
  }

  const assign = (userId: string | null) =>
    startTransition(async () => {
      const outcome = await assignServiceRequest(
        locale,
        propertyId,
        request.id,
        userId,
      );
      onOutcome(outcome.status);
    });
  const canTake =
    request.assignedToUserId !== viewerId &&
    staff.some((person) => person.userId === viewerId);

  return (
    <div className="grid min-w-36 gap-1">
      <Select
        disabled={pending}
        onValueChange={(value) => assign(value === "none" ? null : value)}
        value={request.assignedToUserId ?? "none"}
      >
        <SelectTrigger
          aria-label={t("assignTo")}
          className="h-8 w-full text-xs"
        >
          <SelectValue>{name}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("unassigned")}</SelectItem>
          {staff.map((person) => (
            <SelectItem key={person.userId} value={person.userId}>
              {isolate(staffName(person.email, t("unassigned")))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canTake ? (
        <Button
          className="h-7 justify-self-start px-2 text-xs"
          disabled={pending}
          onClick={() => assign(viewerId)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("assignToMe")}
        </Button>
      ) : null}
    </div>
  );
}
