"use client";

import { useEffect, useState, useActionState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type {
  ServiceRequestCategory,
  ServiceRequestPriority,
  ServiceRequestUnit,
} from "@ranza/guest-services";
import {
  ArrowButton,
  Button,
  CancelButton,
  ChoiceGroup,
  Combobox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  DialogSection,
  DialogTrigger,
  Input,
  Textarea,
  dialogFrameClassName,
  fieldClassName,
  textareaClassName,
} from "@ranza/ui";
import {
  createServiceRequest,
  type ServiceRequestOutcome,
} from "../../../server/guest-services";
import { usePickerLabels } from "../../../lib/picker-labels";
import { submitWithoutReset } from "../../../lib/submit-without-reset";
import { RequestOutcome } from "./request-outcome";

const CATEGORIES: readonly ServiceRequestCategory[] = [
  "housekeeping",
  "maintenance",
  "amenities",
  "front_desk",
  "other",
];

const PRIORITIES: readonly ServiceRequestPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];

export interface CreateRequestDialogProps {
  locale: string;
  propertyId: string;
  units?: readonly ServiceRequestUnit[];
}

export function CreateRequestDialog({
  locale,
  propertyId,
  units = [],
}: CreateRequestDialogProps) {
  const t = useTranslations("guestExperience");
  const all = useTranslations();
  const roomLabels = usePickerLabels(t("selectRoom"));
  const [open, setOpen] = useState(false);

  const boundAction = createServiceRequest.bind(null, locale, propertyId);
  const [state, formAction, isPending] = useActionState<
    ServiceRequestOutcome,
    FormData
  >(boundAction, { status: "idle" });

  const [category, setCategory] = useState<ServiceRequestCategory>("other");
  const [priority, setPriority] = useState<ServiceRequestPriority>("normal");
  const [unitId, setUnitId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const occupant = units.find((unit) => unit.unitId === unitId)?.occupant;

  useEffect(() => {
    if (state.status === "done") {
      setOpen(false);
      setCategory("other");
      setPriority("normal");
      setUnitId("");
      setTitle("");
      setDetails("");
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5" size="sm">
          <Plus className="size-4" />
          {t("newRequest")}
        </Button>
      </DialogTrigger>

      <DialogContent className={dialogFrameClassName("medium")}>
        <form className="grid" onSubmit={submitWithoutReset(formAction)}>
          <DialogMasthead
            art="/illustrations/dialogs/bell.svg"
            eyebrow={t("createDialogTitle")}
            heading={t("createHeading")}
            large
          />
          <input name="accommodationUnitId" type="hidden" value={unitId} />

          <DialogBody>
            <DialogDescription className="m-0 py-5 text-sm">
              {t("createDialogDesc")}
            </DialogDescription>

            <DialogSection
              labelFor="req-title"
              tag={{ label: all("dialogTagRequired"), required: true }}
              title={t("title")}
            >
              <Input
                className={fieldClassName}
                id="req-title"
                maxLength={200}
                minLength={3}
                name="title"
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("titlePlaceholder")}
                required
                value={title}
              />
            </DialogSection>

            <DialogSection title={t("category")} titleId="req-category">
              <ChoiceGroup
                labelledBy="req-category"
                name="category"
                onChange={(value) =>
                  setCategory(value as ServiceRequestCategory)
                }
                options={CATEGORIES.map((cat) => ({
                  label: t(`categories.${cat}`),
                  value: cat,
                }))}
                value={category}
              />
            </DialogSection>

            <DialogSection title={t("priority")} titleId="req-priority">
              <ChoiceGroup
                labelledBy="req-priority"
                name="priority"
                onChange={(value) =>
                  setPriority(value as ServiceRequestPriority)
                }
                options={PRIORITIES.map((p) => ({
                  label: t(`priorities.${p}`),
                  value: p,
                }))}
                value={priority}
              />
            </DialogSection>

            <DialogSection
              hint={
                unitId === ""
                  ? null
                  : occupant
                    ? t("occupantInRoom", { guest: occupant })
                    : t("roomEmptyNow")
              }
              labelFor="req-room"
              tag={{ label: all("dialogTagOptional"), required: false }}
              title={t("room")}
            >
              <Combobox
                id="req-room"
                labels={roomLabels}
                onValueChange={(value) =>
                  setUnitId(value === "none" ? "" : value)
                }
                options={[
                  { value: "none", label: t("noRoom") },
                  ...units.map((unit) => ({
                    value: unit.unitId,
                    label: unit.name,
                    ...(unit.occupant ? { description: unit.occupant } : {}),
                  })),
                ]}
                value={unitId}
              />
            </DialogSection>

            <DialogSection
              labelFor="req-details"
              tag={{ label: all("dialogTagOptional"), required: false }}
              title={t("details")}
            >
              <Textarea
                className={textareaClassName}
                id="req-details"
                maxLength={2000}
                name="details"
                onChange={(event) => setDetails(event.target.value)}
                placeholder={t("detailsPlaceholder")}
                rows={3}
                value={details}
              />
            </DialogSection>

            <div aria-live="polite" className="py-5 empty:hidden">
              <RequestOutcome status={state.status} />
            </div>
          </DialogBody>

          <DialogActions
            hint={title.trim().length >= 3 ? null : t("createHintMissing")}
          >
            <CancelButton
              disabled={isPending}
              onClick={() => setOpen(false)}
              type="button"
            >
              {t("close")}
            </CancelButton>
            <ArrowButton
              disabled={isPending || title.trim().length < 3}
              type="submit"
            >
              {isPending ? t("saving") : t("submit")}
            </ArrowButton>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
