"use client";

import { useEffect, useState, useActionState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import type {
  ServiceRequestCategory,
  ServiceRequestPriority,
} from "@ranza/guest-services";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FormError,
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
  units?: readonly { unitId: string; name: string }[];
}

export function CreateRequestDialog({
  locale,
  propertyId,
  units = [],
}: CreateRequestDialogProps) {
  const t = useTranslations("guestExperience");
  const [open, setOpen] = useState(false);

  const boundAction = createServiceRequest.bind(null, locale, propertyId);
  const [state, formAction, isPending] = useActionState<
    ServiceRequestOutcome,
    FormData
  >(boundAction, { status: "idle" });

  const [category, setCategory] = useState<ServiceRequestCategory>("other");
  const [priority, setPriority] = useState<ServiceRequestPriority>("normal");
  const [unitId, setUnitId] = useState<string>("none");

  useEffect(() => {
    if (state.status === "done") {
      setOpen(false);
      setCategory("other");
      setPriority("normal");
      setUnitId("none");
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
        <form action={formAction} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("createDialogTitle")}</DialogTitle>
            <DialogDescription>{t("createDialogDesc")}</DialogDescription>
          </DialogHeader>

          {state.status === "refused" && (
            <FormError>
              {t("status")} - {t("cancel")}
            </FormError>
          )}

          <div className="grid gap-2">
            <Label htmlFor="req-title">{t("title")}</Label>
            <Input
              id="req-title"
              name="title"
              placeholder={t("titlePlaceholder")}
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
            <Label>{t("room")}</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectRoom")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("noRoom")}</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.unitId} value={u.unitId}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              type="hidden"
              name="accommodationUnitId"
              value={unitId === "none" ? "" : unitId}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="req-details">{t("details")}</Label>
            <Textarea
              id="req-details"
              name="details"
              placeholder={t("detailsPlaceholder")}
              rows={3}
              maxLength={2000}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t("cancel")}
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
