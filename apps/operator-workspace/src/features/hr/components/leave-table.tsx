"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  Input,
  Label,
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
import { AlertCircle, Check, Plus, X } from "lucide-react";
import type {
  EmployeeRecord,
  LeaveRequestRecord,
  LeaveType,
} from "../../../server/viewer";
import {
  decideLeaveAction,
  submitLeaveRequestAction,
} from "../../../server/hr";
import { useOutcomeText } from "./outcome-text";

interface LeaveTableProps {
  /**
   * Only the people who are still employed here, or for the whole Organization:
   * nobody new is recorded for a leaver, and a request for somebody at another
   * Property is refused (HR-12).
   */
  employees: readonly EmployeeRecord[];
  /** Whether anybody at all is employed, to say which reason this is. */
  hasAnyEmployee: boolean;
  leaveRequests: readonly LeaveRequestRecord[];
  canManage: boolean;
  locale: SupportedLocale;
  propertyId: string;
  onShowEmployees: () => void;
}

type Filter = "pending" | "approved" | "rejected" | "all";
const FILTERS: readonly Filter[] = ["pending", "approved", "rejected", "all"];

const LEAVE_TYPES: readonly LeaveType[] = [
  "annual",
  "sick",
  "unpaid",
  "emergency",
  "maternity",
];

export function LeaveTable({
  employees,
  hasAnyEmployee,
  leaveRequests,
  canManage,
  locale,
  propertyId,
  onShowEmployees,
}: LeaveTableProps) {
  const t = useTranslations("hr.leave");
  const outcomeText = useOutcomeText();
  const [isPending, startTransition] = useTransition();

  // Dialog state for submitting leave request
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [leaveType, setLeaveType] = useState<LeaveType>("annual");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<{
    leave: LeaveRequestRecord;
    approved: boolean;
  } | null>(null);
  const pendingCount = leaveRequests.filter(
    (leave) => leave.status === "pending" && !leave.employeeTerminated,
  ).length;
  const [filter, setFilter] = useState<Filter>(
    pendingCount > 0 ? "pending" : "all",
  );
  const ordered = [...leaveRequests]
    .filter((leave) => filter === "all" || leave.status === filter)
    .sort(
      (a, b) =>
        Number(b.status === "pending") - Number(a.status === "pending") ||
        new Date(b.startsOn).getTime() - new Date(a.startsOn).getTime(),
    );

  const formatDay = (date: Date) =>
    formatDate(new Date(date), locale, { timeZone: "UTC" });

  const calculateDays = (start: Date, end: Date) => {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff + 1);
  };

  const handleDecision = (leaveId: string, approved: boolean) => {
    setDecisionError(null);
    startTransition(async () => {
      const outcome = await decideLeaveAction(
        locale,
        propertyId,
        leaveId,
        approved,
      );
      setDecisionError(outcomeText(outcome));
      setDeciding(null);
    });
  };

  const handleSubmitLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId || !startsOn || !endsOn) {
      setErrorMsg(t("incomplete"));
      return;
    }

    setErrorMsg(null);
    startTransition(async () => {
      const outcome = await submitLeaveRequestAction(locale, propertyId, {
        employeeId: selectedEmployeeId,
        leaveType,
        startsOn,
        endsOn,
        notes: notes.trim() || undefined,
      });

      if (outcome.status === "done") {
        setDialogOpen(false);
        setStartsOn("");
        setEndsOn("");
        setNotes("");
      } else {
        setErrorMsg(outcomeText(outcome));
      }
    });
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case "approved":
        return "default";
      case "pending":
        return "secondary";
      case "rejected":
      default:
        return "destructive";
    }
  };

  return (
    <>
      <Card className="border-border">
        <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-step-1 font-semibold text-foreground">
            {t("title")}
          </CardTitle>

          {canManage && employees.length > 0 ? (
            <Dialog
              open={dialogOpen}
              onOpenChange={(isOpen) => {
                if (isPending) return;
                setDialogOpen(isOpen);
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                  <Plus className="size-4" />
                  <span>{t("requestLeave")}</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <form onSubmit={handleSubmitLeave}>
                  <DialogHeader>
                    <DialogTitle>{t("requestLeaveTitle")}</DialogTitle>
                  </DialogHeader>

                  {errorMsg && (
                    <div
                      role="alert"
                      className="mt-3 p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium"
                    >
                      {errorMsg}
                    </div>
                  )}

                  <div className="space-y-4 py-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="leaveEmployee">{t("staffMember")}</Label>
                      <Select
                        value={selectedEmployeeId}
                        onValueChange={setSelectedEmployeeId}
                      >
                        <SelectTrigger id="leaveEmployee">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.fullName} ({emp.department})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="leaveType">{t("type")}</Label>
                      <Select
                        value={leaveType}
                        onValueChange={(val) => setLeaveType(val as LeaveType)}
                      >
                        <SelectTrigger id="leaveType">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAVE_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {t(`types.${type}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="startsOn">{t("startsOn")}</Label>
                        <Input
                          id="startsOn"
                          type="date"
                          required
                          value={startsOn}
                          onChange={(e) => setStartsOn(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="endsOn">{t("endsOn")}</Label>
                        <Input
                          id="endsOn"
                          type="date"
                          required
                          min={startsOn}
                          value={endsOn}
                          onChange={(e) => setEndsOn(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="leaveNotes">{t("notes")}</Label>
                      <Input
                        id="leaveNotes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={t("notesPlaceholder")}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                    >
                      {t("cancel")}
                    </Button>
                    <Button type="submit" disabled={isPending}>
                      {isPending ? t("submitting") : t("submit")}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : canManage ? (
            <Button
              onClick={onShowEmployees}
              size="sm"
              type="button"
              variant="outline"
            >
              {hasAnyEmployee
                ? t("nobodyHereToRequest")
                : t("registerFirstToRequest")}
            </Button>
          ) : null}
        </CardHeader>

        <CardContent className="p-0">
          {decisionError && (
            <div
              role="alert"
              className="mx-4 mb-3 p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium"
            >
              {decisionError}
            </div>
          )}
          {leaveRequests.length > 0 ? (
            <div
              className="flex flex-wrap items-center gap-2 border-b border-border px-4 pb-3"
              role="group"
              aria-label={t("showRequests")}
            >
              {FILTERS.map((option) => (
                <Button
                  aria-pressed={filter === option}
                  data-testid={`leave-filter-${option}`}
                  key={option}
                  onClick={() => setFilter(option)}
                  size="sm"
                  type="button"
                  variant={filter === option ? "default" : "outline"}
                >
                  {option === "all" ? t("filterAll") : t(`statuses.${option}`)}
                  {option === "pending" && pendingCount > 0
                    ? ` (${pendingCount})`
                    : ""}
                </Button>
              ))}
            </div>
          ) : null}
          {leaveRequests.length === 0 ? (
            <div className="p-6">
              <EmptyState description={t("noLeaves")} title={t("emptyTitle")} />
            </div>
          ) : ordered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p
                className="text-step--1 text-muted-foreground"
                data-testid="leave-no-match"
              >
                {t("noneWithStatus", {
                  status: t(`statuses.${filter as "pending"}`),
                })}
              </p>
              <Button
                onClick={() => setFilter("all")}
                type="button"
                variant="outline"
              >
                {t("showAll")}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>{t("staffMember")}</TableHead>
                    <TableHead>{t("type")}</TableHead>
                    <TableHead>{t("dates")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead className="text-end">{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordered.map((l) => {
                    const days = calculateDays(l.startsOn, l.endsOn);
                    const initials = l.employeeName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <TableRow
                        key={l.id}
                        className="border-border hover:bg-muted/30"
                      >
                        <TableCell className="p-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="size-8 border border-border">
                              <AvatarFallback className="bg-primary/10 text-primary text-step--2 font-semibold">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-step--1 text-foreground">
                                {l.employeeName}
                              </div>
                              <div className="text-step--2 text-muted-foreground">
                                {l.employeePosition} · {l.employeeDepartment}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="text-step--1">
                          <span className="font-medium">
                            {t(`types.${l.leaveType}`)}
                          </span>
                          {l.notes && (
                            <span className="block text-step--2 text-muted-foreground truncate max-w-44">
                              {l.notes}
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-step--1">
                          <div className="font-mono text-step--1">
                            {formatDay(l.startsOn)} – {formatDay(l.endsOn)}
                          </div>
                          <div className="text-step--2 text-muted-foreground font-mono">
                            {days} {t("days")}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <Badge variant={statusVariant(l.status)}>
                              {t(`statuses.${l.status}`)}
                            </Badge>
                            {l.employeeTerminated && (
                              <span className="text-step--2 text-muted-foreground">
                                {t("employeeLeft")}
                              </span>
                            )}
                            {l.clash && !l.employeeTerminated && (
                              <div className="flex items-center gap-1 text-destructive text-step--2 font-medium">
                                <AlertCircle className="size-3 shrink-0" />
                                <span>{t("clashWarning")}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-end">
                          {l.status === "pending" &&
                            canManage &&
                            !l.employeeTerminated && (
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  disabled={isPending}
                                  onClick={() =>
                                    setDeciding({ leave: l, approved: true })
                                  }
                                  className="h-8 gap-1 px-2.5"
                                >
                                  <Check className="size-3.5" />
                                  <span>{t("approve")}</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isPending}
                                  onClick={() =>
                                    setDeciding({ leave: l, approved: false })
                                  }
                                  className="h-8 gap-1 px-2.5 text-destructive hover:text-destructive"
                                >
                                  <X className="size-3.5" />
                                  <span>{t("decline")}</span>
                                </Button>
                              </div>
                            )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        onOpenChange={(next) => {
          if (!next && !isPending) setDeciding(null);
        }}
        open={deciding !== null}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          {deciding ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {deciding.approved
                    ? t("confirmApproveTitle", {
                        name: deciding.leave.employeeName,
                      })
                    : t("confirmDeclineTitle", {
                        name: deciding.leave.employeeName,
                      })}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="flex flex-col gap-2">
                    <p>
                      {t("confirmDates", {
                        type: t(`types.${deciding.leave.leaveType}`),
                        from: formatDay(deciding.leave.startsOn),
                        to: formatDay(deciding.leave.endsOn),
                      })}
                    </p>
                    <p>
                      {deciding.approved
                        ? t("confirmApproveEffect")
                        : t("confirmDeclineEffect")}
                    </p>
                    <p>{t("confirmFinal")}</p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  disabled={isPending}
                  onClick={() => setDeciding(null)}
                  type="button"
                  variant="outline"
                >
                  {t("cancel")}
                </Button>
                <Button
                  disabled={isPending}
                  onClick={() =>
                    handleDecision(deciding.leave.id, deciding.approved)
                  }
                  type="button"
                  variant={deciding.approved ? "default" : "destructive"}
                >
                  {deciding.approved ? t("approve") : t("decline")}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
