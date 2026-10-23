"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw, UserRound, Wrench, X } from "lucide-react";
import type {
  BoardState,
  MaintenanceRequestCard,
  ReportOptions,
  ReturnAs,
} from "@ranza/maintenance";
import { isolate, type SupportedLocale } from "@ranza/i18n";
import {
  Button,
  DialogBody,
  DialogFacts,
  DialogMasthead,
  DialogNotice,
  DialogSection,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  Textarea,
  fieldClassName,
  sheetFrameClassName,
  textareaClassName,
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
import { staffName } from "../../../lib/staff-name";
import { ImpactNotice } from "./impact-notice";
import { formatDay, formatInstant, STATE_ICON } from "./look";
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
  propertyId,
  viewerId,
  whenDone,
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
  /** The Property the board is for, which links out of the sheet name. */
  propertyId: string;
  onOpenChange: (open: boolean) => void;
  viewerId: string;
  /** What moving a request to Done does to its room, per the setting. */
  whenDone: { returnOnDone: boolean; returnAs: ReturnAs } | null;
}) {
  const t = useTranslations("maintenance");
  const states = useTranslations("maintenance.states");
  const priorities = useTranslations("maintenance.priorities");
  const returnAs = useTranslations("maintenance.returnAs");

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
  // Done is one click among the others, so the click says what it does to a
  // room it holds before it is made (MAINT-03).
  const doneHint =
    !holding || whenDone === null || !open || room === null
      ? null
      : !whenDone.returnOnDone
        ? t("doneHoldsRoom", { room })
        : mayTakeOutOfOrder
          ? t("doneReturnsRoom", { room, state: returnAs(whenDone.returnAs) })
          : t("doneKeepsRoomOut", { room });

  const facts = [
    states(request.status),
    priorities(request.priority),
    request.kind === "service" ? t("service") : null,
    holding ? t("outOfOrder") : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");

  return (
    <Sheet onOpenChange={onOpenChange} open>
      <SheetContent
        aria-describedby={undefined}
        className={sheetFrameClassName}
        side="end"
      >
        <DialogMasthead
          art="/illustrations/dialogs/wrench.svg"
          eyebrow={t("reference", { number: request.number })}
          facts={facts}
          heading={request.title}
        />

        <DialogBody>
          <DialogSection>
            <DialogFacts
              rows={[
                [t("where"), where || "—"],
                [
                  t("details"),
                  <span className="whitespace-pre-wrap" key="details">
                    {request.details ?? t("noDetails")}
                  </span>,
                ],
                [
                  t("reportedOn", {
                    when: formatInstant(request.reportedAt, locale, timeZone),
                  }),
                  t("reportedBy", {
                    who: isolate(
                      staffName(request.reporter.email, t("formerStaff")),
                    ),
                  }),
                ],
                ...(request.cancelReason
                  ? ([[t("cancelReason"), request.cancelReason]] as const)
                  : []),
                ...(request.hold
                  ? ([
                      [
                        t("outOfOrder"),
                        `${t("outOfOrderSince", {
                          when: formatInstant(
                            request.hold.since,
                            locale,
                            timeZone,
                          ),
                        })}${
                          request.hold.expectedBackOn
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
                            : ""
                        }`,
                      ],
                    ] as const)
                  : []),
              ]}
            />
            {request.status === "done" && holding ? (
              <DialogNotice>{t("heldAfterDone")}</DialogNotice>
            ) : null}
          </DialogSection>
          <DialogSection labelFor="sheet-assignee" title={t("assignee")}>
            <Select
              disabled={!mayManage || pending || request.status === "cancelled"}
              onValueChange={(value) =>
                run("assign", {
                  ...base,
                  assigneeId: value === "none" ? "" : value,
                })
              }
              value={request.assignee?.userId ?? "none"}
            >
              <SelectTrigger className="w-full" id="sheet-assignee">
                <SelectValue>
                  {request.assignee
                    ? request.assignee.reachesProperty
                      ? isolate(
                          staffName(request.assignee.email, t("formerStaff")),
                        )
                      : t("noLongerHere", {
                          name: isolate(
                            staffName(request.assignee.email, t("formerStaff")),
                          ),
                        })
                    : t("notAssigned")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("notAssigned")}</SelectItem>
                {assignees.map((person) => (
                  <SelectItem key={person.userId} value={person.userId}>
                    {staffName(person.email, t("formerStaff"))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mayManage &&
            request.status !== "cancelled" &&
            request.assignee?.userId !== viewerId &&
            assignees.some((person) => person.userId === viewerId) ? (
              <Button
                className="justify-self-start"
                disabled={pending}
                onClick={() => run("assign", { ...base, assigneeId: viewerId })}
                size="sm"
                variant="ghost"
              >
                <UserRound aria-hidden="true" className="size-4" />
                {t("assignToMe")}
              </Button>
            ) : null}
          </DialogSection>

          <DialogSection labelFor="sheet-priority" title={t("priority")}>
            <Select
              disabled={!mayManage || pending || !open}
              onValueChange={(value) =>
                run("prioritise", { ...base, priority: value })
              }
              value={request.priority}
            >
              <SelectTrigger className="w-full" id="sheet-priority">
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
          </DialogSection>

          {mayManage ? (
            <DialogSection hint={doneHint} title={t("state")}>
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
            </DialogSection>
          ) : null}

          {mayTakeOutOfOrder && request.unit !== null && (holding || open) ? (
            <DialogSection title={t("outOfOrder")}>
              {holding ? (
                <div className="grid gap-3">
                  <p className="m-0 text-step--1 text-muted-foreground">
                    {t("returnHint")}
                  </p>
                  <Field htmlFor="sheet-note" label={t("note")}>
                    <Input
                      className={fieldClassName}
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
                  <p className="m-0 text-step--1 text-muted-foreground">
                    {t("takeOutHint")}
                  </p>
                  <Field htmlFor="sheet-expected" label={t("expectedBack")}>
                    <Input
                      className={fieldClassName}
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
                    <ImpactNotice
                      impact={impact}
                      locale={locale}
                      propertyId={propertyId}
                    />
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
            </DialogSection>
          ) : null}

          <RequestMoney
            locale={locale}
            mayCharge={mayCharge}
            mayManage={mayManage}
            request={request}
            vendorMax={limits.vendor}
          />

          {mayManage && open ? (
            <DialogSection title={t("cancelRequest")}>
              {cancelling ? (
                <div className="grid gap-3">
                  <p className="m-0 text-step--1 text-muted-foreground">
                    {t("cancelHint")}
                  </p>
                  <Field htmlFor="sheet-reason" label={t("reason")}>
                    <Textarea
                      className={textareaClassName}
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
                    <p className="m-0 text-step--1 text-muted-foreground">
                      {t("needsReturnPermission")}
                    </p>
                  ) : null}
                </div>
              )}
            </DialogSection>
          ) : null}

          <div aria-live="polite" className="py-5 empty:hidden">
            <OutcomeMessage
              outcome={latest.status === "impact" ? { status: "idle" } : latest}
            />
          </div>
        </DialogBody>
      </SheetContent>
    </Sheet>
  );
}
