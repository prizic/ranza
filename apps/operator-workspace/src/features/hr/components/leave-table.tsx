"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
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
  approveLeaveAction,
  submitLeaveRequestAction,
} from "../../../server/hr";

interface LeaveTableProps {
  employees: readonly EmployeeRecord[];
  leaveRequests: readonly LeaveRequestRecord[];
  canManage: boolean;
  locale: string;
  propertyId: string;
}

export function LeaveTable({
  employees,
  leaveRequests,
  canManage,
  locale,
  propertyId,
}: LeaveTableProps) {
  const t = useTranslations("hr.leave");
  const [isPending, startTransition] = useTransition();

  // Dialog state for submitting leave request
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    employees[0]?.id || "",
  );
  const [leaveType, setLeaveType] = useState<LeaveType>("annual");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(date));
  };

  const calculateDays = (start: Date, end: Date) => {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff + 1);
  };

  const handleApprove = (leaveId: string, approved: boolean) => {
    startTransition(async () => {
      await approveLeaveAction(locale, propertyId, leaveId, approved);
    });
  };

  const handleSubmitLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId || !startsOn || !endsOn) return;

    if (new Date(endsOn) < new Date(startsOn)) {
      setErrorMsg("End date cannot be earlier than start date");
      return;
    }

    setErrorMsg(null);
    startTransition(async () => {
      const res = await submitLeaveRequestAction(locale, propertyId, {
        employeeId: selectedEmployeeId,
        leaveType,
        startsOn,
        endsOn,
        notes: notes.trim() || undefined,
      });

      if (res.status === "done") {
        setDialogOpen(false);
        setStartsOn("");
        setEndsOn("");
        setNotes("");
      } else {
        setErrorMsg(res.message || "Failed to submit leave request");
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
    <Card className="border-border">
      <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-step-1 font-semibold text-foreground">
          {t("title")}
        </CardTitle>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
                <div className="mt-3 p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium">
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
                      <SelectItem value="annual">
                        {t("types.annual")}
                      </SelectItem>
                      <SelectItem value="sick">{t("types.sick")}</SelectItem>
                      <SelectItem value="unpaid">
                        {t("types.unpaid")}
                      </SelectItem>
                      <SelectItem value="emergency">
                        {t("types.emergency")}
                      </SelectItem>
                      <SelectItem value="maternity">
                        {t("types.maternity")}
                      </SelectItem>
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
                    placeholder="Optional notes"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? t("submitting") : t("submit")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="p-0">
        {leaveRequests.length === 0 ? (
          <div className="p-6">
            <EmptyState title={t("title")} description={t("noLeaves")} />
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
                  <TableHead className="text-end">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaveRequests.map((l) => {
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
                          {formatDate(l.startsOn)} – {formatDate(l.endsOn)}
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
                          {l.clash && (
                            <div className="flex items-center gap-1 text-destructive text-step--2 font-medium">
                              <AlertCircle className="size-3 shrink-0" />
                              <span>{t("clashWarning")}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-end">
                        {l.status === "pending" && canManage && (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              disabled={isPending}
                              onClick={() => handleApprove(l.id, true)}
                              className="h-8 gap-1 px-2.5"
                            >
                              <Check className="size-3.5" />
                              <span>{t("approve")}</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isPending}
                              onClick={() => handleApprove(l.id, false)}
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
  );
}
