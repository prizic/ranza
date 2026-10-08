"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Avatar,
  AvatarFallback,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ranza/ui";
import { Info } from "lucide-react";
import type {
  EmployeeRecord,
  ShiftRecord,
  ShiftType,
} from "../../../server/viewer";
import { assignShiftAction } from "../../../server/hr";

interface RotaTableProps {
  employees: readonly EmployeeRecord[];
  shifts: readonly ShiftRecord[];
  canManage: boolean;
  locale: string;
  propertyId: string;
}

const SHIFT_CYCLE: ShiftType[] = ["morning", "evening", "day", "off"];

export function RotaTable({
  employees,
  shifts,
  canManage,
  locale,
  propertyId,
}: RotaTableProps) {
  const t = useTranslations("hr.rota");
  const [, startTransition] = useTransition();

  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  // Compute Monday to Sunday for the current week
  const today = new Date();
  const currentDayOfWeek = today.getDay(); // 0 is Sun, 1 is Mon...
  const distanceToMonday = (currentDayOfWeek + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - distanceToMonday);
  monday.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 7 }).map((_, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
    const dateStr = d.toISOString().slice(0, 10);
    const dayName = new Intl.DateTimeFormat(locale, {
      weekday: "short",
    }).format(d);
    return { date: d, dateStr, dayName, isToday };
  });

  const getShift = (
    employeeId: string,
    dateStr: string,
  ): ShiftRecord | undefined => {
    return shifts.find(
      (s) =>
        s.employeeId === employeeId &&
        new Date(s.date).toISOString().slice(0, 10) === dateStr,
    );
  };

  const handleCycleShift = (
    employeeId: string,
    dateStr: string,
    currentType: ShiftType,
  ) => {
    if (!canManage) return;
    const key = `${employeeId}:${dateStr}`;
    if (pendingKeys.has(key)) return;

    const nextIndex =
      (SHIFT_CYCLE.indexOf(currentType) + 1) % SHIFT_CYCLE.length;
    const nextType: ShiftType = SHIFT_CYCLE[nextIndex] ?? "off";

    setPendingKeys((prev) => new Set(prev).add(key));

    startTransition(async () => {
      try {
        await assignShiftAction(locale, propertyId, {
          employeeId,
          date: dateStr,
          shiftType: nextType,
        });
      } finally {
        setPendingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    });
  };

  const shiftBadgeClasses = (type: ShiftType) => {
    switch (type) {
      case "morning":
        return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 border-blue-200 dark:border-blue-800 hover:bg-blue-200";
      case "evening":
        return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-200 dark:border-amber-800 hover:bg-amber-200";
      case "day":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-200";
      case "off":
      default:
        return "bg-muted text-muted-foreground border-border hover:bg-muted/80";
    }
  };

  const shiftTimeLabel = (type: ShiftType) => {
    switch (type) {
      case "morning":
        return t("shiftTimes.morning");
      case "evening":
        return t("shiftTimes.evening");
      case "day":
        return t("shiftTimes.day");
      case "off":
      default:
        return t("shiftTimes.off");
    }
  };

  return (
    <Card className="border-border">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-step-1 font-semibold text-foreground">
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="w-56 font-semibold">
                  {t("staffMember")}
                </TableHead>
                {days.map((d) => (
                  <TableHead
                    key={d.dateStr}
                    className={`text-center font-medium min-w-28 ${
                      d.isToday ? "text-primary font-bold bg-primary/5" : ""
                    }`}
                  >
                    <span>{d.dayName}</span>
                    {d.isToday && (
                      <span className="block text-step--2 text-primary font-normal">
                        ({t("today")})
                      </span>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => {
                const initials =
                  `${e.firstName.charAt(0)}${e.lastName.charAt(0)}`.toUpperCase();

                return (
                  <TableRow
                    key={e.id}
                    className="border-border hover:bg-muted/30"
                  >
                    <TableCell className="p-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-8 border border-border">
                          <AvatarFallback className="bg-primary/10 text-primary text-step--2 font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium text-step--1 text-foreground truncate">
                            {e.fullName}
                          </div>
                          <div className="text-step--2 text-muted-foreground truncate">
                            {e.position}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {days.map((d) => {
                      const shift = getShift(e.id, d.dateStr);
                      const shiftType: ShiftType = shift
                        ? shift.shiftType
                        : "off";

                      return (
                        <TableCell
                          key={d.dateStr}
                          className={`p-2 text-center ${
                            d.isToday ? "bg-primary/5" : ""
                          }`}
                        >
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  disabled={
                                    !canManage ||
                                    pendingKeys.has(`${e.id}:${d.dateStr}`)
                                  }
                                  onClick={() =>
                                    handleCycleShift(e.id, d.dateStr, shiftType)
                                  }
                                  className={`inline-flex items-center justify-center px-2.5 py-1 text-step--2 rounded-full border transition-all ${
                                    pendingKeys.has(`${e.id}:${d.dateStr}`)
                                      ? "opacity-50 cursor-wait animate-pulse"
                                      : ""
                                  } ${shiftBadgeClasses(shiftType)} ${canManage ? "cursor-pointer" : "cursor-default"}`}
                                >
                                  {t(`shifts.${shiftType}`)}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-semibold text-step--2">
                                  {t(`shifts.${shiftType}`)}
                                </p>
                                <p className="text-step--2 text-muted-foreground">
                                  {shiftTimeLabel(shiftType)}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="p-4 border-t border-border flex items-center gap-2 text-step--1 text-muted-foreground bg-muted/20">
          <Info className="size-4 shrink-0 text-muted-foreground" />
          <span>{t("hint")}</span>
        </div>
      </CardContent>
    </Card>
  );
}
