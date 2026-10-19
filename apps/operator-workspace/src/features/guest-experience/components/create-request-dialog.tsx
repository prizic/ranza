"use client";

import { useEffect, useState, useActionState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import type {
  ServiceRequestCategory,
  ServiceRequestPriority,
  ServiceRequestUnit,
} from "@ranza/guest-services";
import {
  Button,
  Combobox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

      <DialogContent className="sm:max-w-lg">
        <form className="grid gap-4" onSubmit={submitWithoutReset(formAction)}>
          <DialogHeader>
            <DialogTitle>{t("createDialogTitle")}</DialogTitle>
            <DialogDescription>{t("createDialogDesc")}</DialogDescription>
          </DialogHeader>

          <RequestOutcome status={state.status} />

          <div className="grid gap-2">
            <Label htmlFor="req-title">{t("title")}</Label>
            <Input
              id="req-title"
              name="title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("titlePlaceholder")}
              value={title}
              required
              minLength={3}
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>{t("category")}</Label>
              <Select
                value={category}
                onValueChange={(val) =>
                  setCategory(val as ServiceRequestCategory)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {t(`categories.${cat}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="category" value={category} />
            </div>

            <div className="grid gap-2">
              <Label>{t("priority")}</Label>
              <Select
                value={priority}
                onValueChange={(val) =>
                  setPriority(val as ServiceRequestPriority)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectPriority")} />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`priorities.${p}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="priority" value={priority} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="req-room">{t("room")}</Label>
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
            {unitId === "" ? null : (
              <p className="text-step--1 text-muted-foreground">
                {occupant
                  ? t("occupantInRoom", { guest: occupant })
                  : t("roomEmptyNow")}
              </p>
            )}
            <input type="hidden" name="accommodationUnitId" value={unitId} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="req-details">{t("details")}</Label>
            <Textarea
              id="req-details"
              name="details"
              onChange={(event) => setDetails(event.target.value)}
              placeholder={t("detailsPlaceholder")}
              value={details}
              rows={3}
              maxLength={2000}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t("close")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending} className="gap-1.5">
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              {isPending ? t("saving") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
