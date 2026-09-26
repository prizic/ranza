"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
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
  DialogTrigger,
  Field,
  FormError,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ranza/ui";
import { addRooms, type AddRoomsOutcome } from "../../../server/accommodation";

export function AddRoomsDialog({
  locale,
  propertyId,
}: {
  locale: string;
  propertyId: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [letByTheBed, setLetByTheBed] = useState(false);
  const [outcome, act, pending] = useActionState<AddRoomsOutcome, FormData>(
    addRooms,
    { status: "idle" },
  );

  useEffect(() => {
    if (outcome.status === "done") {
      setOpen(false);
      setLetByTheBed(false);
    }
  }, [outcome.status]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2" size="sm">
          <Plus aria-hidden="true" className="size-4" />
          {t("addRooms")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addRooms")}</DialogTitle>
          <DialogDescription>{t("roomsSubtitle")}</DialogDescription>
        </DialogHeader>

        <form action={act} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="propertyId" value={propertyId} />

          {outcome.status !== "idle" && outcome.status !== "done" && (
            <FormError>{outcome.message ?? t("bookingRefused")}</FormError>
          )}

          <div className="grid grid-cols-2 gap-4 items-start">
            <Field htmlFor="building" label={t("building")}>
              <Input
                id="building"
                name="building"
                placeholder="Main"
                maxLength={60}
              />
            </Field>

            <Field htmlFor="floor" label={t("floor")}>
              <Input
                id="floor"
                name="floor"
                type="number"
                min={-20}
                max={200}
                placeholder="1"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4 items-start">
            <Field htmlFor="unitType" label={t("stayTypeLabel")}>
              <Select defaultValue="room" name="unitType">
                <SelectTrigger id="unitType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="room">{t("unitType.room")}</SelectItem>
                  <SelectItem value="apartment">
                    {t("unitType.apartment")}
                  </SelectItem>
                  <SelectItem value="suite">{t("unitType.suite")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field
              hint={t("firstNumberHint")}
              htmlFor="firstNumber"
              label={t("firstNumber")}
            >
              <Input
                aria-describedby="firstNumber-hint"
                id="firstNumber"
                name="firstNumber"
                placeholder="101"
                required
                pattern="^[0-9]{1,8}$"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4 items-start">
            <Field htmlFor="count" label={t("roomCount")}>
              <Input
                id="count"
                name="count"
                type="number"
                min={1}
                max={60}
                defaultValue={1}
                required
              />
            </Field>

            <Field htmlFor="capacity" label={t("capacityPerRoom")}>
              <Input
                id="capacity"
                name="capacity"
                type="number"
                min={1}
                max={letByTheBed ? 26 : 64}
                defaultValue={2}
                required
              />
            </Field>
          </div>

          <div className="flex items-start gap-3 pt-2">
            <Checkbox
              id="letByTheBed"
              name="letByTheBed"
              checked={letByTheBed}
              onCheckedChange={(checked) => setLetByTheBed(Boolean(checked))}
            />
            <div className="grid gap-1.5 leading-none">
              <Label
                htmlFor="letByTheBed"
                className="cursor-pointer font-medium"
              >
                {t("letByTheBed")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("letByTheBedHint")}
              </p>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                {t("discardBooking")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? t("addingRooms") : t("addRooms")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
