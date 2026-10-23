"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  MaintenanceRequestCard,
  Priority,
  ReportOptions,
} from "@ranza/maintenance";
import type { SupportedLocale } from "@ranza/i18n";
import {
  ArrowButton,
  CancelButton,
  ChoiceGroup,
  Combobox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  DialogNotice,
  DialogSection,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  TickRow,
  dialogFrameClassName,
  fieldClassName,
  textareaClassName,
} from "@ranza/ui";
import {
  reportProblem,
  type MaintenanceOutcome,
} from "../../../server/maintenance";
import { ImpactNotice } from "./impact-notice";
import { OutcomeMessage } from "./outcome-message";
import { usePickerLabels } from "../../../lib/picker-labels";
import { staffName } from "../../../lib/staff-name";
import { submitWithoutReset } from "../../../lib/submit-without-reset";

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
 * Every field is controlled and the form is submitted without React's reset
 * (`submitWithoutReset`): the second submit after an impact must carry the
 * first one's words, its room and its switch.
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
  openRequests,
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
  /** The requests still open, so a room already reported says so. */
  openRequests: readonly MaintenanceRequestCard[];
  /** What the board says once the dialog has closed on a success. */
  onDone: (outcome: MaintenanceOutcome) => void;
}) {
  const t = useTranslations("maintenance");
  const all = useTranslations();
  const priorities = useTranslations("maintenance.priorities");
  const states = useTranslations("maintenance.states");
  const unitLabels = usePickerLabels(t("chooseUnit"));
  const [outcome, act, pending] = useActionState<MaintenanceOutcome, FormData>(
    reportProblem,
    { status: "idle" },
  );
  const [unitId, setUnitId] = useState(initialUnitId ?? "");
  const [equipmentId, setEquipmentId] = useState("");
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
  // A warning is about taking this room out: unticked, there is nothing to
  // confirm, and the button goes back to sending a report.
  const impact =
    outcome.status === "impact" &&
    warnedUnitId === unitId &&
    outOfOrder &&
    !blocked
      ? outcome.impact
      : undefined;
  const unitLabel = (candidate: ReportOptions["units"][number]) =>
    candidate.roomName === null
      ? candidate.name
      : t("bedInRoom", { bed: candidate.name, room: candidate.roomName });
  const alreadyOpen = openRequests.filter(
    (request) =>
      unitId !== "" &&
      request.unit?.unitId === unitId &&
      request.status !== "done" &&
      request.status !== "cancelled",
  );

  const ready =
    (unitId !== "" || equipmentId !== "") && title.trim().length >= 3;
  const required = { label: all("dialogTagRequired"), required: true } as const;
  const optional = {
    label: all("dialogTagOptional"),
    required: false,
  } as const;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {/* It scrolls: with the people affected listed it is taller than a
          laptop's window, and its confirm button is at the bottom. */}
      <DialogContent className={dialogFrameClassName("medium")}>
        <form
          className="grid"
          onSubmit={submitWithoutReset(act, () => {
            submittedUnitId.current = unitId;
          })}
        >
          <DialogMasthead
            art="/illustrations/dialogs/wrench.svg"
            eyebrow={t("reportTitle")}
            heading={t("reportHeading")}
            large
          />
          <input name="locale" type="hidden" value={locale} />
          <input name="propertyId" type="hidden" value={propertyId} />
          <input name="unitId" type="hidden" value={unitId} />
          <input name="equipmentId" type="hidden" value={equipmentId} />
          <input name="assigneeId" type="hidden" value={assigneeId} />
          {impact ? (
            <input name="acknowledge" type="hidden" value="true" />
          ) : null}

          <DialogBody>
            <DialogDescription className="m-0 py-5 text-sm">
              {t("reportDescription")}
            </DialogDescription>

            <DialogSection
              labelFor="report-unit"
              tag={options.equipment.length > 0 ? optional : required}
              title={t("unit")}
            >
              <Combobox
                id="report-unit"
                labels={unitLabels}
                onValueChange={(value) =>
                  setUnitId(value === "none" ? "" : value)
                }
                options={[
                  { value: "none", label: t("noRoomChosen") },
                  ...options.units.map((candidate) => ({
                    value: candidate.unitId,
                    label:
                      candidate.status === "out_of_service"
                        ? `${unitLabel(candidate)} · ${t("alreadyOut")}`
                        : unitLabel(candidate),
                    keywords: [candidate.name, candidate.roomName ?? ""],
                  })),
                ]}
                value={unitId}
              />
              {alreadyOpen.length > 0 ? (
                <DialogNotice>
                  <span className="grid gap-1">
                    <span className="font-medium">
                      {t("alreadyOpenForRoom")}
                    </span>
                    {alreadyOpen.map((request) => (
                      <span key={request.requestId}>
                        {t("reference", { number: request.number })} ·{" "}
                        {request.title} · {states(request.status)}
                      </span>
                    ))}
                  </span>
                </DialogNotice>
              ) : null}
            </DialogSection>

            {options.equipment.length > 0 ? (
              <DialogSection
                labelFor="report-equipment"
                tag={optional}
                title={t("equipment")}
              >
                <Select
                  onValueChange={(value) =>
                    setEquipmentId(value === "none" ? "" : value)
                  }
                  value={equipmentId === "" ? "none" : equipmentId}
                >
                  <SelectTrigger className="w-full" id="report-equipment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {t("noEquipmentChosen")}
                    </SelectItem>
                    {options.equipment.map((item) => (
                      <SelectItem
                        key={item.equipmentId}
                        value={item.equipmentId}
                      >
                        {item.name} · {item.where}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DialogSection>
            ) : null}

            <DialogSection
              labelFor="report-title"
              tag={required}
              title={t("whatIsWrong")}
            >
              <Input
                autoComplete="off"
                autoFocus={initialUnitId !== null}
                className={fieldClassName}
                id="report-title"
                maxLength={limits.title}
                minLength={3}
                name="title"
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("whatPlaceholder")}
                required
                value={title}
              />
            </DialogSection>

            <DialogSection
              labelFor="report-details"
              tag={optional}
              title={t("moreDetails")}
            >
              <Textarea
                className={textareaClassName}
                id="report-details"
                maxLength={limits.details}
                name="details"
                onChange={(event) => setDetails(event.target.value)}
                rows={3}
                value={details}
              />
            </DialogSection>

            <DialogSection title={t("howUrgent")} titleId="report-priority">
              <ChoiceGroup
                labelledBy="report-priority"
                name="priority"
                onChange={(value) => setPriority(value as Priority)}
                options={PRIORITIES.map((value) => ({
                  label: priorities(value),
                  value,
                }))}
                value={priority}
              />
            </DialogSection>

            {mayManage ? (
              <DialogSection
                labelFor="report-assignee"
                tag={optional}
                title={t("assignTo")}
              >
                <Select
                  onValueChange={(value) =>
                    setAssigneeId(value === "later" ? "" : value)
                  }
                  value={assigneeId === "" ? "later" : assigneeId}
                >
                  <SelectTrigger className="w-full" id="report-assignee">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="later">{t("decideLater")}</SelectItem>
                    {options.assignees.map((person) => (
                      <SelectItem key={person.userId} value={person.userId}>
                        {staffName(person.email, t("formerStaff"))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DialogSection>
            ) : null}

            {mayTakeOutOfOrder && unitId !== "" ? (
              <DialogSection
                hint={blocked ? t("unitBlocked") : t("takeOutHint")}
                labelFor="report-out-of-order"
              >
                <TickRow
                  checked={outOfOrder && !blocked}
                  disabled={blocked}
                  id="report-out-of-order"
                  name="outOfOrder"
                  onCheckedChange={setOutOfOrder}
                  value="on"
                >
                  {t("outOfOrderSwitch")}
                </TickRow>
                {outOfOrder && !blocked ? (
                  <div className="mt-4 grid gap-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="report-expected"
                    >
                      {t("expectedBack")}
                    </label>
                    <Input
                      className={fieldClassName}
                      id="report-expected"
                      min={today}
                      name="expectedBackOn"
                      onChange={(event) =>
                        setExpectedBackOn(event.target.value)
                      }
                      type="date"
                      value={expectedBackOn}
                    />
                  </div>
                ) : null}
              </DialogSection>
            ) : null}

            {impact ? (
              <div className="py-5">
                <ImpactNotice
                  impact={impact}
                  locale={locale}
                  propertyId={propertyId}
                />
              </div>
            ) : null}
            <div aria-live="polite" className="py-5 empty:hidden">
              <OutcomeMessage
                outcome={
                  outcome.status === "impact" ? { status: "idle" } : outcome
                }
              />
            </div>
          </DialogBody>

          <DialogActions hint={ready ? null : t("reportHintMissing")}>
            <CancelButton onClick={() => onOpenChange(false)} type="button">
              {t("close")}
            </CancelButton>
            <ArrowButton disabled={pending || !ready} type="submit">
              {pending
                ? t("saving")
                : impact
                  ? t("confirmOutOfOrder")
                  : t("send")}
            </ArrowButton>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
