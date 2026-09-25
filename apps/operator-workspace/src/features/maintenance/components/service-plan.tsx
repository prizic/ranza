"use client";

import { useTranslations } from "next-intl";
import { ClipboardPlus, ClipboardList } from "lucide-react";
import type {
  EquipmentItem,
  EquipmentRegister as Register,
} from "@ranza/maintenance";
import type { SupportedLocale } from "@ranza/i18n";
import { Button, EmptyState, StatusBadge } from "@ranza/ui";
import { createWorkOrder } from "../../../server/maintenance";
import { EquipmentWhere } from "./equipment-register";
import { ConditionBadge, formatDay } from "./look";
import { OutcomeMessage } from "./outcome-message";
import { useCommand } from "./use-command";

const DAY_MS = 86_400_000;

/**
 * The service plan (MT-S4-01): every item in use with a service interval, by
 * the date its next service falls due, soonest first — the register's own
 * order. An item with a work order open shows that order instead of the button,
 * so a second cannot be raised for it (MT-S4-03); the database refuses one
 * either way.
 */
export function ServicePlan({
  register,
  locale,
}: {
  register: Register;
  locale: SupportedLocale;
}) {
  const t = useTranslations("maintenance");
  const create = useCommand(createWorkOrder, locale);
  const planned = register.items.filter(
    (item): item is EquipmentItem & { nextServiceOn: string } =>
      !item.retired && item.nextServiceOn !== null,
  );

  if (planned.length === 0) {
    // How to fill the plan is only worth saying to whoever may.
    return (
      <EmptyState
        description={
          register.mayManageEquipment
            ? t("noPlanDescription")
            : t("equipmentReadOnly")
        }
        title={t("noPlanTitle")}
      />
    );
  }

  return (
    <div className="grid gap-3">
      <OutcomeMessage outcome={create.outcome} />
      <ul className="grid gap-2">
        {planned.map((item) => {
          const days = daysUntil(item.nextServiceOn, register.today);
          return (
            <li
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"
              key={item.equipmentId}
            >
              <div className="grid gap-1">
                <span className="font-medium">{item.name}</span>
                <span className="text-step--1 text-muted-foreground">
                  <EquipmentWhere item={item} />
                  {item.serviceIntervalMonths !== null
                    ? ` · ${t("everyMonths", { count: item.serviceIntervalMonths })}`
                    : ""}
                  {` · ${t("lastServiced")}: ${
                    item.lastServicedOn === null
                      ? t("neverServiced")
                      : formatDay(item.lastServicedOn, locale)
                  }`}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="grid justify-items-end gap-1 text-end">
                  <span className="text-step--1 tabular-nums">
                    {formatDay(item.nextServiceOn, locale)}
                  </span>
                  <span className="text-step--1 text-muted-foreground">
                    {days < 0
                      ? t("daysOverdue", { count: -days })
                      : days === 0
                        ? t("dueToday")
                        : t("inDays", { count: days })}
                  </span>
                </div>
                <ConditionBadge condition={item.condition} />
                {item.openWorkOrder ? (
                  <StatusBadge
                    icon={ClipboardList}
                    label={t("workOrderOpen", {
                      number: item.openWorkOrder.number,
                    })}
                    tone="info"
                  />
                ) : register.mayReport ? (
                  <Button
                    disabled={create.pending}
                    onClick={() =>
                      create.run({
                        equipmentId: item.equipmentId,
                        name: item.name,
                      })
                    }
                    size="sm"
                    variant={
                      item.condition === "overdue" || item.condition === "due"
                        ? "default"
                        : "outline"
                    }
                  >
                    <ClipboardPlus aria-hidden="true" className="size-4" />
                    {t("createWorkOrder")}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Days from the Property's today to a calendar day; negative when past. */
function daysUntil(day: string, today: string): number {
  return Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      DAY_MS,
  );
}
