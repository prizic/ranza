"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Priority, ReportOptions } from "@ranza/maintenance";
import type { SupportedLocale } from "@ranza/i18n";
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@ranza/ui";
import {
  reportProblem,
  type MaintenanceOutcome,
} from "../../../server/maintenance";
import { ImpactNotice } from "./impact-notice";
import { PRIORITY_LOOK } from "./look";
import { OutcomeMessage } from "./outcome-message";

const PRIORITIES: readonly Priority[] = ["urgent", "this_week", "can_wait"];

/**
 * Reporting a problem (MT-S1-01), and taking its room out of order in the
 * same step when the reporter may (MT-S2-01).
 *
 * The switch is offered only to whoever may take a room out, and is disabled
 * with the reason for a blocked room (MT-S2-08). Taking out a room somebody is
 * in or booked on comes back as an impact rather than a refusal: the form is
 * kept, the people affected are listed, and the same submit with the
 * acknowledgement goes ahead (MT-S2-09, MT-S2-10).
 *
 * Every field is controlled: React resets a form's uncontrolled fields after
 * each action, and the second submit after an impact must carry the first
 * one's words.
 */
export function ReportDialog({
  locale,
  propertyId,
  options,
  mayManage,
  mayTakeOutOfOrder,
  limits,
  open,
  onOpenChange,
  initialUnitId,
  today,
  onDone,
}: {
  locale: SupportedLocale;
  propertyId: string;
  options: ReportOptions;
  mayManage: boolean;
  mayTakeOutOfOrder: boolean;
  limits: { title: number; details: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUnitId: string | null;
  today: string;
  /** What the board says once the dialog has closed on a success. */
  onDone: (outcome: MaintenanceOutcome) => void;
}) {
  const t = useTranslations("maintenance");
  const priorities = useTranslations("maintenance.priorities");
  const [outcome, act, pending] = useActionState<MaintenanceOutcome, FormData>(
    reportProblem,
    { status: "idle" },
  );
  const [unitId, setUnitId] = useState(initialUnitId ?? "");
  const [priority, setPriority] = useState<Priority>("this_week");
  const [assigneeId, setAssigneeId] = useState("");
  const [outOfOrder, setOutOfOrder] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [expectedBackOn, setExpectedBackOn] = useState("");
  // The room the desk was warned about. An acknowledgement is for that room
  // only: choosing another one asks again.
  const [warnedUnitId, setWarnedUnitId] = useState<string | null>(null);
  const submittedUnitId = useRef<string | null>(null);

  useEffect(() => {
    if (outcome.status === "impact") setWarnedUnitId(submittedUnitId.current);
    if (outcome.status !== "done") return;
    onDone(outcome);
    onOpenChange(false);
  }, [outcome, onDone, onOpenChange]);

  const unit = options.units.find((candidate) => candidate.unitId === unitId);
  const blocked = unit?.status === "blocked";
  const impact =
    outcome.status === "impact" && warnedUnitId === unitId
      ? outcome.impact
      : undefined;
  const unitLabel = (candidate: ReportOptions["units"][number]) =>
    candidate.roomName === null
      ? candidate.name
      : t("bedInRoom", { bed: candidate.name, room: candidate.roomName });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("reportTitle")}</DialogTitle>
          <DialogDescription>{t("reportDescription")}</DialogDescription>
        </DialogHeader>

        <form
          action={act}
          className="grid gap-4"
          onSubmit={() => {
            submittedUnitId.current = unitId;
          }}
        >
          <input name="locale" type="hidden" value={locale} />
          <input name="propertyId" type="hidden" value={propertyId} />
          <input name="unitId" type="hidden" value={unitId} />
          <input name="priority" type="hidden" value={priority} />
          <input name="assigneeId" type="hidden" value={assigneeId} />
          {impact ? (
            <input name="acknowledge" type="hidden" value="true" />
          ) : null}

          <Field htmlFor="report-unit" label={t("unit")}>
            <Select onValueChange={setUnitId} value={unitId}>
              <SelectTrigger id="report-unit">
                <SelectValue placeholder={t("chooseUnit")} />
              </SelectTrigger>
              <SelectContent>
                {options.units.map((candidate) => (
                  <SelectItem key={candidate.unitId} value={candidate.unitId}>
                    {unitLabel(candidate)}
                    {candidate.status === "out_of_service"
                      ? ` · ${t("alreadyOut")}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field htmlFor="report-title" label={t("whatIsWrong")}>
            <Input
              autoComplete="off"
              id="report-title"
              maxLength={limits.title}
              minLength={3}
              name="title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("whatPlaceholder")}
              required
              value={title}
            />
          </Field>

          <Field htmlFor="report-details" label={t("moreDetails")}>
            <Textarea
              id="report-details"
              maxLength={limits.details}
              name="details"
              onChange={(event) => setDetails(event.target.value)}
              rows={3}
              value={details}
            />
          </Field>

          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-step--1 font-medium">
              {t("howUrgent")}
            </legend>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {PRIORITIES.map((value) => {
                const Icon = PRIORITY_LOOK[value].icon;
                return (
                  <Button
                    aria-checked={priority === value}
                    key={value}
                    onClick={() => setPriority(value)}
                    role="radio"
                    size="sm"
                    type="button"
                    variant={priority === value ? "default" : "outline"}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {priorities(value)}
                  </Button>
                );
              })}
            </div>
          </fieldset>

          {mayManage ? (
            <Field htmlFor="report-assignee" label={t("assignTo")}>
              <Select
                onValueChange={(value) =>
                  setAssigneeId(value === "later" ? "" : value)
                }
                value={assigneeId === "" ? "later" : assigneeId}
              >
                <SelectTrigger id="report-assignee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="later">{t("decideLater")}</SelectItem>
                  {options.assignees.map((person) => (
                    <SelectItem key={person.userId} value={person.userId}>
                      {person.email ?? t("formerStaff")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {mayTakeOutOfOrder ? (
            <div className="grid gap-3 rounded-lg border p-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={outOfOrder && !blocked}
                  disabled={blocked}
                  id="report-out-of-order"
                  name="outOfOrder"
                  onCheckedChange={(checked) => setOutOfOrder(checked === true)}
                  value="on"
                />
                <div className="grid gap-1">
                  <Label htmlFor="report-out-of-order">
                    {t("outOfOrderSwitch")}
                  </Label>
                  <p className="text-step--1 text-muted-foreground">
                    {blocked ? t("unitBlocked") : t("takeOutHint")}
                  </p>
                </div>
              </div>
              {outOfOrder && !blocked ? (
                <Field htmlFor="report-expected" label={t("expectedBack")}>
                  <Input
                    id="report-expected"
                    min={today}
                    name="expectedBackOn"
                    onChange={(event) => setExpectedBackOn(event.target.value)}
                    type="date"
                    value={expectedBackOn}
                  />
                </Field>
              ) : null}
            </div>
          ) : null}

          {impact ? <ImpactNotice impact={impact} locale={locale} /> : null}
          <OutcomeMessage
            outcome={outcome.status === "impact" ? { status: "idle" } : outcome}
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("close")}
              </Button>
            </DialogClose>
            <Button disabled={pending || unitId === ""} type="submit">
              {pending
                ? t("saving")
                : impact
                  ? t("confirmOutOfOrder")
                  : t("send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
