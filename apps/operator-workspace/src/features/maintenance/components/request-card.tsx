"use client";

import { useTranslations } from "next-intl";
import { UserRound } from "lucide-react";
import type { MaintenanceRequestCard } from "@ranza/maintenance";
import { isolate, type SupportedLocale } from "@ranza/i18n";
import { Card } from "@ranza/ui";
import { formatDay, OutOfOrderBadge, PriorityBadge } from "./look";

/**
 * One request on the board: its number, what is wrong, where, how urgent,
 * whether it holds its room, and who has it (MT-S1-10). The whole card opens
 * the request, so the target is as large as the thing it names.
 */
export function RequestCard({
  request,
  locale,
  onOpen,
}: {
  request: MaintenanceRequestCard;
  locale: SupportedLocale;
  onOpen: () => void;
}) {
  const t = useTranslations("maintenance");
  const room =
    request.unit === null
      ? null
      : request.unit.roomName === null
        ? request.unit.name
        : t("bedInRoom", {
            bed: request.unit.name,
            room: request.unit.roomName,
          });
  const where =
    [room, request.equipment?.name ?? null]
      .filter((part) => part !== null)
      .join(" · ") || null;

  return (
    <Card className="p-0 transition-colors hover:bg-muted/40">
      <button
        aria-label={t("openRequest", { number: request.number })}
        className="grid w-full gap-2 rounded-xl p-3 text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={onOpen}
        type="button"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {t("reference", { number: request.number })}
          </span>
          {where ? (
            <span className="truncate text-xs text-muted-foreground">
              {isolate(where)}
            </span>
          ) : null}
        </div>
        <p className="line-clamp-2 text-step--1 font-medium">{request.title}</p>
        <div className="flex flex-wrap gap-1.5">
          <PriorityBadge priority={request.priority} />
          {request.hold ? <OutOfOrderBadge /> : null}
        </div>
        {request.hold?.expectedBackOn ? (
          <p
            className={
              request.hold.overdue
                ? "text-xs font-medium text-danger"
                : "text-xs text-muted-foreground"
            }
          >
            {request.hold.overdue
              ? t("overdueSince", {
                  date: formatDay(request.hold.expectedBackOn, locale),
                })
              : t("backOn", {
                  date: formatDay(request.hold.expectedBackOn, locale),
                })}
          </p>
        ) : null}
        <p
          className={
            request.assignee
              ? "flex items-center gap-1.5 text-xs text-muted-foreground"
              : "flex items-center gap-1.5 text-xs text-warning"
          }
        >
          <UserRound aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">
            {request.assignee
              ? isolate(request.assignee.email ?? t("formerStaff"))
              : t("notAssigned")}
          </span>
        </p>
      </button>
    </Card>
  );
}
