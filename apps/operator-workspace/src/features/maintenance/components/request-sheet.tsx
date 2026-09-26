"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, RotateCcw, Wrench, X } from "lucide-react";
import type {
  BoardState,
  MaintenanceRequestCard,
  ReportOptions,
} from "@ranza/maintenance";
import { isolate, type SupportedLocale } from "@ranza/i18n";
import {
  Button,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  StatusBadge,
  Textarea,
} from "@ranza/ui";
import {
  assignRequest,
  cancelRequest,
  moveRequest,
  prioritiseRequest,
  returnRoomToService,
  takeRoomOutOfOrder,
  type MaintenanceOutcome,
} from "../../../server/maintenance";
import { ImpactNotice } from "./impact-notice";
import {
  formatDay,
  formatInstant,
  OutOfOrderBadge,
  PriorityBadge,
  Section,
  STATE_ICON,
} from "./look";
import { OutcomeMessage } from "./outcome-message";
import { RequestMoney } from "./request-money";
import { useCommand } from "./use-command";

const BOARD: readonly BoardState[] = [
  "new",
  "in_progress",
  "waiting_for_parts",
  "done",
];
const PRIORITIES = ["urgent", "this_week", "can_wait"] as const;
const OPEN: readonly string[] = ["new", "in_progress", "waiting_for_parts"];

type Command =
  "move" | "cancel" | "assign" | "prioritise" | "takeOut" | "giveBack";

/**
 * One request, everything known about it, and every action the viewer may
 * take on it as a plain button (MT-S1-11 onwards).
 *
 * Controls follow the permissions the board read: a Staff Member without
 * `maintenance.manage` sees the facts and no control that moves anything
 * (MT-S1-12), and the out-of-order controls follow
 * `maintenance.take_out_of_order`. Hiding them is courtesy; the policies
 * refuse a forged command either way.
 */
export function RequestSheet({
  request,
  locale,
  timeZone,
  today,
  assignees,
  mayManage,
  mayTakeOutOfOrder,
  mayCharge,
  limits,
  onOpenChange,
}: {
  request: MaintenanceRequestCard | null;
  locale: SupportedLocale;
  timeZone: string;
  today: string;
  assignees: ReportOptions["assignees"];
  mayManage: boolean;
  mayTakeOutOfOrder: boolean;
  mayCharge: boolean;
  limits: { cancelReason: number; note: number; vendor: number };
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("maintenance");
  const states = useTranslations("maintenance.states");
  const priorities = useTranslations("maintenance.priorities");

  const byName: Record<Command, ReturnType<typeof useCommand>> = {
    move: useCommand(moveRequest, locale),
    cancel: useCommand(cancelRequest, locale),
    assign: useCommand(assignRequest, locale),
    prioritise: useCommand(prioritiseRequest, locale),
    takeOut: useCommand(takeRoomOutOfOrder, locale),
    giveBack: useCommand(returnRoomToService, locale),
  };

  const [last, setLast] = useState<Command | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [takingOut, setTakingOut] = useState(false);
  const [expectedBackOn, setExpectedBackOn] = useState("");
  const [note, setNote] = useState("");

  if (!request) return null;

  const pending = Object.values(byName).some((command) => command.pending);
  // The one to report is whichever the viewer used last.
  const latest: MaintenanceOutcome =
    last === null ? { status: "idle" } : byName[last].outcome;
  function run(name: Command, fields: Record<string, string>) {
    setLast(name);
    byName[name].run(fields);
  }

  const open = OPEN.includes(request.status);
  const holding = request.hold !== null;
  const impact =
    byName.takeOut.outcome.status === "impact"
      ? byName.takeOut.outcome.impact
      : undefined;
  const room =
    request.unit === null
      ? null
      : request.unit.roomName === null
        ? request.unit.name
        : t("bedInRoom", {
            bed: request.unit.name,
            room: request.unit.roomName,
          });
  const where = [room, request.equipment?.name ?? null]
    .filter((part) => part !== null)
    .join(" · ");
  const base = { requestId: request.requestId };

  return (
    <Sheet onOpenChange={onOpenChange} open>
      <SheetContent
        className="w-full gap-0 overflow-y-auto sm:max-w-lg"
        side="end"
      >
        <SheetHeader className="gap-3 border-b">
          <SheetDescription>
            {t("reference", { number: request.number })}
          </SheetDescription>
          <SheetTitle className="text-step-1">{request.title}</SheetTitle>
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              icon={STATE_ICON[request.status]}
              label={states(request.status)}
              tone={request.status === "done" ? "success" : "neutral"}
            />
            <PriorityBadge priority={request.priority} />
            {request.kind === "service" ? (
              <StatusBadge
                icon={CalendarClock}
                label={t("service")}
                tone="info"
              />
            ) : null}
            {holding ? <OutOfOrderBadge /> : null}
          </div>
        </SheetHeader>

        <div className="grid gap-5 p-4">
          <dl className="grid gap-3 text-step--1">
            <Fact label={t("where")}>{where || "—"}</Fact>
            <Fact label={t("details")}>
              <span className="whitespace-pre-wrap">
                {request.details ?? t("noDetails")}
              </span>
            </Fact>
            <Fact
              label={t("reportedOn", {
                when: formatInstant(request.reportedAt, locale, timeZone),
              })}
            >
              {t("reportedBy", {
                who: isolate(request.reporter.email ?? t("formerStaff")),
              })}
            </Fact>
            {request.cancelReason ? (
              <Fact label={t("cancelReason")}>{request.cancelReason}</Fact>
            ) : null}
            {request.hold ? (
              <Fact label={t("outOfOrder")}>
                {t("outOfOrderSince", {
                  when: formatInstant(request.hold.since, locale, timeZone),
                })}
                {request.hold.expectedBackOn
                  ? ` · ${
                      request.hold.overdue
                        ? t("overdueSince", {
                            date: formatDay(
                              request.hold.expectedBackOn,
                              locale,
                            ),
                          })
                        : t("backOn", {
                            date: formatDay(
                              request.hold.expectedBackOn,
                              locale,
                            ),
                          })
                    }`
                  : ""}
              </Fact>
            ) : null}
          </dl>

          {request.status === "done" && holding ? (
            <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-step--1 text-warning">
              {t("heldAfterDone")}
            </p>
          ) : null}

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="sheet-assignee" label={t("assignee")}>
              <Select
                disabled={
                  !mayManage || pending || request.status === "cancelled"
                }
                onValueChange={(value) =>
                  run("assign", {
                    ...base,
                    assigneeId: value === "none" ? "" : value,
                  })
                }
                value={request.assignee?.userId ?? "none"}
              >
                <SelectTrigger id="sheet-assignee">
                  <SelectValue>
                    {request.assignee
                      ? request.assignee.reachesProperty
                        ? isolate(request.assignee.email ?? t("formerStaff"))
                        : t("noLongerHere", {
                            name: isolate(
                              request.assignee.email ?? t("formerStaff"),
                            ),
                          })
                      : t("notAssigned")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("notAssigned")}</SelectItem>
                  {assignees.map((person) => (
                    <SelectItem key={person.userId} value={person.userId}>
                      {person.email ?? t("formerStaff")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field htmlFor="sheet-priority" label={t("priority")}>
              <Select
                disabled={!mayManage || pending || !open}
                onValueChange={(value) =>
                  run("prioritise", { ...base, priority: value })
                }
                value={request.priority}
              >
                <SelectTrigger id="sheet-priority">
                  <SelectValue>{priorities(request.priority)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {priorities(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {mayManage ? (
            <Section title={t("state")}>
              <div className="flex flex-wrap gap-2">
                {request.status === "cancelled" ? (
                  <Button
                    disabled={pending}
                    onClick={() =>
                      run("move", { ...base, from: "cancelled", to: "new" })
                    }
                    size="sm"
                    variant="outline"
                  >
                    <RotateCcw aria-hidden="true" className="size-4" />
                    {t("reopen")}
                  </Button>
                ) : (
                  BOARD.filter((state) => state !== request.status).map(
                    (state) => {
                      const Icon = STATE_ICON[state];
                      return (
                        <Button
                          disabled={pending}
                          key={state}
                          onClick={() =>
                            run("move", {
                              ...base,
                              from: request.status,
                              to: state,
                            })
                          }
                          size="sm"
                          variant={state === "done" ? "default" : "outline"}
                        >
                          <Icon aria-hidden="true" className="size-4" />
                          {t("moveTo", { state: states(state) })}
                        </Button>
                      );
                    },
                  )
                )}
              </div>
            </Section>
          ) : null}

          {mayTakeOutOfOrder && request.unit !== null && (holding || open) ? (
            <Section title={t("outOfOrder")}>
              {holding ? (
                <div className="grid gap-3">
                  <p className="text-step--1 text-muted-foreground">
                    {t("returnHint")}
                  </p>
                  <Field htmlFor="sheet-note" label={t("note")}>
                    <Input
                      id="sheet-note"
                      maxLength={limits.note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder={t("notePlaceholder")}
                      value={note}
                    />
                  </Field>
                  <Button
                    className="justify-self-start"
                    disabled={pending}
                    onClick={() => run("giveBack", { ...base, note })}
                    size="sm"
                  >
                    <RotateCcw aria-hidden="true" className="size-4" />
                    {t("returnToService")}
                  </Button>
                </div>
              ) : takingOut ? (
                <div className="grid gap-3">
                  <p className="text-step--1 text-muted-foreground">
                    {t("takeOutHint")}
                  </p>
                  <Field htmlFor="sheet-expected" label={t("expectedBack")}>
                    <Input
                      id="sheet-expected"
                      min={today}
                      onChange={(event) =>
                        setExpectedBackOn(event.target.value)
                      }
                      type="date"
                      value={expectedBackOn}
                    />
                  </Field>
                  {impact ? (
                    <ImpactNotice impact={impact} locale={locale} />
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run("takeOut", {
                          ...base,
                          expectedBackOn,
                          acknowledge: impact ? "true" : "false",
                        })
                      }
                      size="sm"
                      variant="destructive"
                    >
                      <Wrench aria-hidden="true" className="size-4" />
                      {impact ? t("confirmOutOfOrder") : t("takeOutOfOrder")}
                    </Button>
                    <Button
                      onClick={() => setTakingOut(false)}
                      size="sm"
                      variant="ghost"
                    >
                      {t("keep")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  className="justify-self-start"
                  disabled={pending}
                  onClick={() => setTakingOut(true)}
                  size="sm"
                  variant="outline"
                >
                  <Wrench aria-hidden="true" className="size-4" />
                  {t("takeOutOfOrder")}
                </Button>
              )}
            </Section>
          ) : null}

          <RequestMoney
            locale={locale}
            mayCharge={mayCharge}
            mayManage={mayManage}
            request={request}
            vendorMax={limits.vendor}
          />

          {mayManage && open ? (
            <Section title={t("cancelRequest")}>
              {cancelling ? (
                <div className="grid gap-3">
                  <p className="text-step--1 text-muted-foreground">
                    {t("cancelHint")}
                  </p>
                  <Field htmlFor="sheet-reason" label={t("reason")}>
                    <Textarea
                      id="sheet-reason"
                      maxLength={limits.cancelReason}
                      minLength={3}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={t("reasonPlaceholder")}
                      rows={2}
                      value={reason}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={pending || reason.trim().length < 3}
                      onClick={() =>
                        run("cancel", { ...base, from: request.status, reason })
                      }
                      size="sm"
                      variant="destructive"
                    >
                      <X aria-hidden="true" className="size-4" />
                      {t("cancelRequest")}
                    </Button>
                    <Button
                      onClick={() => setCancelling(false)}
                      size="sm"
                      variant="ghost"
                    >
                      {t("keep")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-1">
                  {/* Cancelling lets go of the room first, which needs the
                      permission to return rooms: without it the whole cancel
                      is refused, so the button says why instead. */}
                  <Button
                    className="justify-self-start"
                    disabled={pending || (holding && !mayTakeOutOfOrder)}
                    onClick={() => setCancelling(true)}
                    size="sm"
                    variant="ghost"
                  >
                    <X aria-hidden="true" className="size-4" />
                    {t("cancelRequest")}
                  </Button>
                  {holding && !mayTakeOutOfOrder ? (
                    <p className="text-step--1 text-muted-foreground">
                      {t("needsReturnPermission")}
                    </p>
                  ) : null}
                </div>
              )}
            </Section>
          ) : null}

          <OutcomeMessage
            outcome={latest.status === "impact" ? { status: "idle" } : latest}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}
