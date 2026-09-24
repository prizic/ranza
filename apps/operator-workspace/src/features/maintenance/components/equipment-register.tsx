"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArchiveRestore, Archive, Info, Pencil, Plus } from "lucide-react";
import type {
  EquipmentItem,
  EquipmentRegister as Register,
  ReportOptions,
} from "@ranza/maintenance";
import { isolate, type SupportedLocale } from "@ranza/i18n";
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
  EmptyState,
  Field,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import {
  saveEquipment,
  setEquipmentRetired,
  type MaintenanceOutcome,
} from "../../../server/maintenance";
import { ConditionBadge, formatDay } from "./look";
import { OutcomeMessage } from "./outcome-message";
import { useCommand } from "./use-command";

export interface EquipmentLimits {
  name: number;
  category: number;
  location: number;
  interval: number;
}

/**
 * The equipment register (MT-S3-01 onwards): what is serviced and can break
 * at this Property, where it is, and its condition.
 *
 * Whoever may keep equipment adds, changes, retires and restores items; for
 * anybody else the register is read-only and says so (MT-S3-08). An item is
 * retired, never deleted, because requests still name it (MT-S3-06).
 */
export function EquipmentRegisterPanel({
  register,
  units,
  locale,
  propertyId,
  propertyName,
  limits,
}: {
  register: Register;
  units: ReportOptions["units"];
  locale: SupportedLocale;
  propertyId: string;
  propertyName: string;
  limits: EquipmentLimits;
}) {
  const t = useTranslations("maintenance");
  const retire = useCommand(setEquipmentRetired, locale);
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState<EquipmentItem | "new" | null>(null);
  const [saved, setSaved] = useState<MaintenanceOutcome>({ status: "idle" });
  const closeDialog = useCallback(() => setEditing(null), []);

  const visible = showRetired
    ? register.items
    : register.items.filter((item) => !item.retired);
  const mayChange = register.mayManageEquipment;

  const add = mayChange ? (
    <Button onClick={() => setEditing("new")}>
      <Plus aria-hidden="true" className="size-4" />
      {t("addEquipment")}
    </Button>
  ) : null;

  return (
    <div className="grid gap-4">
      {mayChange || register.items.length === 0 ? null : (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-step--1 text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("equipmentReadOnly")}
        </p>
      )}

      {register.items.length === 0 ? (
        <EmptyState
          action={add}
          description={
            mayChange ? t("noEquipmentDescription") : t("equipmentReadOnly")
          }
          title={t("noEquipmentTitle", { property: propertyName })}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex h-9 items-center gap-2">
              <Checkbox
                checked={showRetired}
                id="equipment-show-retired"
                onCheckedChange={(value) => setShowRetired(value === true)}
              />
              <Label htmlFor="equipment-show-retired">{t("showRetired")}</Label>
            </div>
            {add}
          </div>

          <OutcomeMessage
            outcome={saved.status === "idle" ? retire.outcome : saved}
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("equipmentName")}</TableHead>
                <TableHead>{t("whereIs")}</TableHead>
                <TableHead>{t("state")}</TableHead>
                <TableHead>{t("lastServiced")}</TableHead>
                <TableHead>{t("nextService")}</TableHead>
                {mayChange ? (
                  <TableHead className="text-end">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => (
                <TableRow
                  className={item.retired ? "text-muted-foreground" : ""}
                  key={item.equipmentId}
                >
                  <TableCell>
                    <div className="grid gap-0.5">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-step--1 text-muted-foreground">
                        {item.category}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <EquipmentWhere item={item} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.retired ? (
                        <StatusBadge
                          icon={Archive}
                          label={t("retired")}
                          tone="neutral"
                        />
                      ) : (
                        <ConditionBadge condition={item.condition} />
                      )}
                      {item.openFault && !item.retired ? (
                        <span className="text-step--1 text-muted-foreground">
                          {t("reference", { number: item.openFault.number })}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.lastServicedOn === null ? (
                      <span className="text-muted-foreground">
                        {t("neverServiced")}
                      </span>
                    ) : (
                      formatDay(item.lastServicedOn, locale)
                    )}
                  </TableCell>
                  <TableCell>
                    {item.nextServiceOn === null ||
                    item.serviceIntervalMonths === null ? (
                      <span className="text-muted-foreground">
                        {t("notScheduled")}
                      </span>
                    ) : (
                      <div className="grid gap-0.5">
                        <span>{formatDay(item.nextServiceOn, locale)}</span>
                        <span className="text-step--1 text-muted-foreground">
                          {t("everyMonths", {
                            count: item.serviceIntervalMonths,
                          })}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  {mayChange ? (
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        {item.retired ? null : (
                          <Button
                            aria-label={`${t("change")} ${isolate(item.name)}`}
                            onClick={() => setEditing(item)}
                            size="sm"
                            variant="ghost"
                          >
                            <Pencil aria-hidden="true" className="size-4" />
                            {t("change")}
                          </Button>
                        )}
                        <Button
                          disabled={retire.pending}
                          onClick={() => {
                            setSaved({ status: "idle" });
                            retire.run({
                              equipmentId: item.equipmentId,
                              retired: item.retired ? "false" : "true",
                            });
                          }}
                          size="sm"
                          variant="ghost"
                        >
                          {item.retired ? (
                            <ArchiveRestore
                              aria-hidden="true"
                              className="size-4"
                            />
                          ) : (
                            <Archive aria-hidden="true" className="size-4" />
                          )}
                          {item.retired ? t("restore") : t("retire")}
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {editing !== null ? (
        <EquipmentDialog
          item={editing === "new" ? null : editing}
          key={editing === "new" ? "new" : editing.equipmentId}
          limits={limits}
          locale={locale}
          onClose={closeDialog}
          onSaved={setSaved}
          propertyId={propertyId}
          today={register.today}
          units={units}
        />
      ) : null}
    </div>
  );
}

/** Where an item is: its room, or the place it was given (MT-S3-02). */
export function EquipmentWhere({ item }: { item: EquipmentItem }) {
  const t = useTranslations("maintenance");
  if (item.unit === null) return <>{item.location ?? "—"}</>;
  return (
    <>
      {item.unit.roomName === null
        ? item.unit.name
        : t("bedInRoom", { bed: item.unit.name, room: item.unit.roomName })}
    </>
  );
}

/**
 * Adding or changing an item. Controlled fields, as in the report form: a
 * refused save keeps what was typed.
 */
function EquipmentDialog({
  item,
  units,
  locale,
  propertyId,
  today,
  limits,
  onClose,
  onSaved,
}: {
  item: EquipmentItem | null;
  units: ReportOptions["units"];
  locale: SupportedLocale;
  propertyId: string;
  today: string;
  limits: EquipmentLimits;
  onClose: () => void;
  onSaved: (outcome: MaintenanceOutcome) => void;
}) {
  const t = useTranslations("maintenance");
  const [outcome, act, pending] = useActionState<MaintenanceOutcome, FormData>(
    saveEquipment,
    { status: "idle" },
  );
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [where, setWhere] = useState<"room" | "place">(
    item?.unit ? "room" : "place",
  );
  const [unitId, setUnitId] = useState(item?.unit?.unitId ?? "");
  const [location, setLocation] = useState(item?.location ?? "");
  const [months, setMonths] = useState(
    item?.serviceIntervalMonths?.toString() ?? "",
  );
  const [lastServicedOn, setLastServicedOn] = useState(
    item?.lastServicedOn ?? "",
  );

  useEffect(() => {
    if (outcome.status !== "done") return;
    onSaved(outcome);
    onClose();
  }, [outcome, onSaved, onClose]);

  const placed = where === "room" ? unitId !== "" : location.trim() !== "";

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {item ? t("editEquipment") : t("addEquipment")}
          </DialogTitle>
          <DialogDescription>{t("noEquipmentDescription")}</DialogDescription>
        </DialogHeader>

        <form action={act} className="grid gap-4">
          <input name="locale" type="hidden" value={locale} />
          <input name="propertyId" type="hidden" value={propertyId} />
          {item ? (
            <>
              <input
                name="equipmentId"
                type="hidden"
                value={item.equipmentId}
              />
              <input
                name="lastServicedOnWas"
                type="hidden"
                value={item.lastServicedOn ?? ""}
              />
            </>
          ) : null}
          <input name="where" type="hidden" value={where} />
          <input name="unitId" type="hidden" value={unitId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="equipment-name" label={t("equipmentName")}>
              <Input
                autoComplete="off"
                id="equipment-name"
                maxLength={limits.name}
                name="name"
                onChange={(event) => setName(event.target.value)}
                placeholder={t("equipmentNamePlaceholder")}
                required
                value={name}
              />
            </Field>
            <Field htmlFor="equipment-category" label={t("category")}>
              <Input
                autoComplete="off"
                id="equipment-category"
                maxLength={limits.category}
                name="category"
                onChange={(event) => setCategory(event.target.value)}
                placeholder={t("categoryPlaceholder")}
                required
                value={category}
              />
            </Field>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-step--1 font-medium">
              {t("whereIs")}
            </legend>
            <div className="flex flex-wrap gap-2">
              {(["room", "place"] as const).map((value) => (
                <Button
                  aria-pressed={where === value}
                  key={value}
                  onClick={() => setWhere(value)}
                  size="sm"
                  type="button"
                  variant={where === value ? "default" : "outline"}
                >
                  {value === "room" ? t("atRoom") : t("atPlace")}
                </Button>
              ))}
            </div>
            {where === "room" ? (
              <Select onValueChange={setUnitId} value={unitId}>
                <SelectTrigger aria-label={t("unit")} id="equipment-unit">
                  <SelectValue placeholder={t("chooseUnit")} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.unitId} value={unit.unitId}>
                      {unit.roomName === null
                        ? unit.name
                        : t("bedInRoom", {
                            bed: unit.name,
                            room: unit.roomName,
                          })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                aria-label={t("place")}
                autoComplete="off"
                id="equipment-location"
                maxLength={limits.location}
                name="location"
                onChange={(event) => setLocation(event.target.value)}
                placeholder={t("placePlaceholder")}
                value={location}
              />
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="equipment-interval" label={t("interval")}>
              <Input
                id="equipment-interval"
                inputMode="numeric"
                max={limits.interval}
                min={1}
                name="interval"
                onChange={(event) => setMonths(event.target.value)}
                type="number"
                value={months}
              />
            </Field>
            <Field htmlFor="equipment-last" label={t("lastServiced")}>
              <Input
                id="equipment-last"
                max={today}
                name="lastServicedOn"
                onChange={(event) => setLastServicedOn(event.target.value)}
                type="date"
                value={lastServicedOn}
              />
            </Field>
          </div>
          <p className="-mt-2 text-step--1 text-muted-foreground">
            {t("intervalHint")}
          </p>

          <OutcomeMessage outcome={outcome} />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("close")}
              </Button>
            </DialogClose>
            <Button
              disabled={
                pending ||
                name.trim() === "" ||
                category.trim() === "" ||
                !placed
              }
              type="submit"
            >
              {pending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
