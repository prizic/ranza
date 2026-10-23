"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { addDays } from "../../../lib/hr-week";
import type {
  EmployeeRecord,
  ShiftRecord,
  ShiftType,
} from "../../../server/viewer";
import { assignShiftAction } from "../../../server/hr";
import { useOutcomeText } from "./outcome-text";

interface RotaTableProps {
  /** Only the people who work at this Property, or for the whole Organization. */
  employees: readonly EmployeeRecord[];
  /** Whether anybody at all is employed, to say which empty state this is. */
  hasAnyEmployee: boolean;
  shifts: readonly ShiftRecord[];
  canManage: boolean;
  locale: SupportedLocale;
  propertyId: string;
  /** The Property's own calendar date, `YYYY-MM-DD`. */
  today: string;
  /** Monday to Sunday on the Property's calendar (HR-06). */
  week: readonly string[];
  onShowEmployees: () => void;
}

const SHIFTS: readonly ShiftType[] = ["morning", "evening", "day", "off"];

const TIMES: Record<ShiftType, string> = {
  morning: "07:00–15:00",
  evening: "15:00–23:00",
  day: "09:00–18:00",
  off: "",
};

const BADGE: Record<ShiftType, string> = {
  morning:
    "border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  evening:
    "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  day: "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  off: "border-border bg-muted text-muted-foreground",
};

/**
 * The week's rota, a week at a time.
 *
 * The dates are the Property's own and arrive from the server; the cells are a
 * choice of shift, not a button that cycles through them — a cycle made Morning
 * to Off three saves and showed no times (HR-07). A person who does not work at
 * this Property is not a row, because a shift set for them is refused (HR-12).
 */
export function RotaTable({
  employees,
  hasAnyEmployee,
  shifts,
  canManage,
  locale,
  propertyId,
  today,
  week,
  onShowEmployees,
}: RotaTableProps) {
  const t = useTranslations("hr.rota");
  const outcomeText = useOutcomeText();
  const [, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const monday = week[0] ?? today;
  const sunday = week[6] ?? today;
  const weekHref = (start: string) =>
    `/${locale}/hr?property=${propertyId}&tab=rota&week=${start}`;
  const shown = (day: string, options: Intl.DateTimeFormatOptions) =>
    formatDate(new Date(`${day}T00:00:00Z`), locale, {
      timeZone: "UTC",
      ...options,
    });

  const shiftOf = (employeeId: string, day: string): ShiftType =>
    shifts.find(
      (shift) =>
        shift.employeeId === employeeId &&
        new Date(shift.date).toISOString().slice(0, 10) === day,
    )?.shiftType ?? "off";

  const assign = (employeeId: string, day: string, shiftType: ShiftType) => {
    const key = `${employeeId}:${day}`;
    if (pendingKeys.has(key)) return;
    setPendingKeys((previous) => new Set(previous).add(key));
    setFailure(null);
    startTransition(async () => {
      try {
        const outcome = await assignShiftAction(locale, propertyId, {
          employeeId,
          date: day,
          shiftType,
        });
        setFailure(outcomeText(outcome));
      } finally {
        setPendingKeys((previous) => {
          const next = new Set(previous);
          next.delete(key);
          return next;
        });
      }
    });
  };

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 p-4 pb-3">
        <div>
          <CardTitle className="text-step-1 font-semibold text-foreground">
            {t("title")}
          </CardTitle>
          <p
            className="text-step--1 text-muted-foreground"
            data-testid="rota-week"
          >
            {shown(monday, { year: undefined })} – {shown(sunday, {})}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button asChild size="icon" variant="ghost" className="size-8">
            <Link
              aria-label={t("previousWeek")}
              href={weekHref(addDays(monday, -7))}
              prefetch={false}
            >
              <ChevronLeft className="size-4 rtl:rotate-180" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link
              href={`/${locale}/hr?property=${propertyId}&tab=rota`}
              prefetch={false}
            >
              {t("thisWeek")}
            </Link>
          </Button>
          <Button asChild size="icon" variant="ghost" className="size-8">
            <Link
              aria-label={t("nextWeek")}
              href={weekHref(addDays(monday, 7))}
              prefetch={false}
            >
              <ChevronRight className="size-4 rtl:rotate-180" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {failure && (
          <div
            role="alert"
            className="mx-4 mb-3 rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive"
          >
            {failure}
          </div>
        )}
        {employees.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={hasAnyEmployee ? t("nobodyHereTitle") : t("emptyTitle")}
              description={
                hasAnyEmployee ? t("nobodyHere") : t("registerFirst")
              }
              action={
                <Button
                  onClick={onShowEmployees}
                  type="button"
                  variant="outline"
                >
                  {t("goToEmployees")}
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="w-56 font-semibold">
                    {t("staffMember")}
                  </TableHead>
                  {week.map((day) => (
                    <TableHead
                      key={day}
                      className={`min-w-32 text-center font-medium ${
                        day === today
                          ? "bg-primary/5 font-bold text-primary"
                          : ""
                      }`}
                    >
                      <span>
                        {shown(day, {
                          day: undefined,
                          month: undefined,
                          year: undefined,
                          weekday: "short",
                        })}
                      </span>
                      <span className="block text-step--2 font-normal text-muted-foreground">
                        {shown(day, { year: undefined })}
                        {day === today ? ` (${t("today")})` : ""}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => {
                  const initials =
                    `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();
                  return (
                    <TableRow
                      key={employee.id}
                      className="border-border hover:bg-muted/30"
                    >
                      <TableCell className="p-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-8 border border-border">
                            <AvatarFallback className="bg-primary/10 text-step--2 font-semibold text-primary">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate text-step--1 font-medium text-foreground">
                              {employee.fullName}
                            </div>
                            <div className="truncate text-step--2 text-muted-foreground">
                              {employee.position}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      {week.map((day) => {
                        const shiftType = shiftOf(employee.id, day);
                        const busy = pendingKeys.has(`${employee.id}:${day}`);
                        return (
                          <TableCell
                            key={day}
                            className={`p-2 text-center ${
                              day === today ? "bg-primary/5" : ""
                            }`}
                          >
                            {canManage ? (
                              <Select
                                disabled={busy}
                                onValueChange={(next) =>
                                  assign(employee.id, day, next as ShiftType)
                                }
                                value={shiftType}
                              >
                                <SelectTrigger
                                  aria-label={`${employee.fullName}, ${shown(day, { year: undefined })}`}
                                  className={`h-8 w-full min-w-28 rounded-full border text-step--2 ${BADGE[shiftType]} ${busy ? "animate-pulse opacity-50" : ""}`}
                                  data-shift={shiftType}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {SHIFTS.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {t(`shifts.${option}`)}
                                      {TIMES[option]
                                        ? ` · ${TIMES[option]}`
                                        : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span
                                className={`inline-flex flex-col items-center rounded-full border px-2.5 py-1 text-step--2 ${BADGE[shiftType]}`}
                              >
                                {t(`shifts.${shiftType}`)}
                                {TIMES[shiftType] ? (
                                  <span className="opacity-80">
                                    {TIMES[shiftType]}
                                  </span>
                                ) : null}
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border bg-muted/20 p-4 text-step--1 text-muted-foreground">
          <Info className="size-4 shrink-0 text-muted-foreground" />
          <span>{canManage ? t("hint") : t("hintReadOnly")}</span>
        </div>
      </CardContent>
    </Card>
  );
}
