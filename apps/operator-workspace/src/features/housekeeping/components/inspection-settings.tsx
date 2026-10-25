"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CalendarCheck, Lock } from "lucide-react";
import type { InspectionSettings as Settings } from "@ranza/housekeeping";
import type { SupportedLocale } from "@ranza/i18n";
import {
  ArrowButton,
  Button,
  CancelButton,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  FormError,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  dialogFrameClassName,
  useUnsavedChangesGuard,
} from "@ranza/ui";
import {
  setInspection,
  type InspectionOutcome,
} from "../../../server/housekeeping";
import { WRAPPING_TRIGGER } from "../../configuration/options";
import { DefaultReachLines } from "../../configuration/components/default-reach-lines";
import { HousekeepingStatusBadge } from "./status";

type PropertyChoice = "default" | "on" | "off";

/**
 * Whether a cleaned room waits to be inspected before it is ready (slice 3).
 *
 * Two answers and one result: the Organization's default, this Property's own
 * answer or "use the Organization's", and the flow that follows, drawn so the
 * choice shows what it does before anybody has to guess (HK-S3-09). The flow
 * follows the choice as it is made; nothing is written until a Save is pressed
 * (CONFIG-02). The Organization's answer governs every Property, so saving it
 * first names what it changes for all of them; this Property's own answer
 * changes this Property only, and its button says so.
 *
 * A reader who may change one of the two sees both, the other disabled with
 * the reason beside it: the value still matters to them, it is what their board
 * obeys. A reader who may change neither is told what applies in a sentence on
 * its own screen, where two controls nobody can use are a screen of nothing on
 * a phone; inside Configuration, which shows every setting beside the others,
 * both values stay and each says which permission would let them change it.
 *
 * `embedded` is for a screen that draws its own card around it (Configuration):
 * the title and hint are then that card's.
 */
export function InspectionSettings({
  embedded = false,
  locale,
  propertyId,
  settings,
}: {
  embedded?: boolean;
  locale: SupportedLocale;
  propertyId: string;
  settings: Settings;
}) {
  const t = useTranslations("housekeeping");
  const configuration = useTranslations("configuration");
  const permissions = useTranslations("staff.permissions");
  const everywhere = useTranslations();
  const [outcome, dispatch, pending] = useActionState<
    InspectionOutcome,
    FormData
  >(setInspection, { status: "idle" });

  const [baseline, setBaseline] = useState<{
    organization: boolean;
    property: PropertyChoice;
  } | null>(null);
  const [organizationDraft, setOrganizationDraft] = useState<boolean | null>(
    null,
  );
  const [propertyDraft, setPropertyDraft] = useState<PropertyChoice | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const submitted = useRef<{
    scope: "property" | "organization";
    value: string;
  } | null>(null);

  const readProperty: PropertyChoice =
    settings.propertyOverride === null
      ? "default"
      : settings.propertyOverride
        ? "on"
        : "off";
  // What is saved: what the page was read with, until a save the page has not
  // caught up with yet says otherwise — so a saved choice does not flicker
  // back to the old one while the refreshed settings are on their way.
  const savedOrganization =
    baseline?.organization ?? settings.organizationDefault;
  const savedProperty = baseline?.property ?? readProperty;

  // The page's fresh read replaces anything remembered, and what was saved is
  // what the next draft is measured against.
  useEffect(() => {
    setBaseline(null);
  }, [settings.organizationDefault, settings.propertyOverride]);

  useEffect(() => {
    if (outcome.status !== "done" || !submitted.current) return;
    const { scope, value } = submitted.current;
    submitted.current = null;
    if (scope === "organization") {
      setBaseline((current) => ({
        organization: value === "on",
        property: current?.property ?? readProperty,
      }));
      setOrganizationDraft(null);
    } else {
      setBaseline((current) => ({
        organization: current?.organization ?? settings.organizationDefault,
        property: value as PropertyChoice,
      }));
      setPropertyDraft(null);
    }
    // The outcome is the trigger; what it was about is in the ref.
  }, [outcome]);

  const organizationValue = organizationDraft ?? savedOrganization;
  const propertyValue = propertyDraft ?? savedProperty;
  const organizationChanged = organizationValue !== savedOrganization;
  const propertyChanged = propertyValue !== savedProperty;
  const dirty = organizationChanged || propertyChanged;
  useUnsavedChangesGuard(dirty && !pending, everywhere("unsavedChanges"));

  // The flow shows the choice as it stands, saved or not.
  const effective =
    propertyValue === "default" ? organizationValue : propertyValue === "on";

  function save(scope: "property" | "organization") {
    const value =
      scope === "organization"
        ? organizationValue
          ? "on"
          : "off"
        : propertyValue;
    submitted.current = { scope, value };
    const form = new FormData();
    form.set("locale", locale);
    form.set("propertyId", propertyId);
    form.set("scope", scope);
    form.set("value", value);
    startTransition(() => dispatch(form));
  }

  function discard() {
    setOrganizationDraft(null);
    setPropertyDraft(null);
  }

  // Two controls nobody here can use are a screen of nothing on a phone: the
  // answer that applies, and who can change it, say the same in a sentence.
  if (!embedded && !settings.mayConfigure && !settings.mayConfigureDefault) {
    return (
      <Card className="grid gap-1 p-5">
        <h2 className="text-step-0 font-semibold">{t("inspectionTitle")}</h2>
        <p className="max-w-prose text-step--1 text-muted-foreground">
          {settings.effective
            ? t("inspectionReadOnlyOn")
            : t("inspectionReadOnlyOff")}
        </p>
      </Card>
    );
  }

  const onOff = (value: boolean) => (value ? t("on") : t("off"));
  const inheritLabel = t("useDefault", {
    value: onOff(organizationValue),
  });

  const body = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="inspection-organization">
            {t("organizationDefault")}
          </Label>
          <Select
            disabled={!settings.mayConfigureDefault || pending}
            onValueChange={(value) => setOrganizationDraft(value === "on")}
            value={organizationValue ? "on" : "off"}
          >
            <SelectTrigger
              className={WRAPPING_TRIGGER}
              id="inspection-organization"
            >
              <SelectValue>{onOff(organizationValue)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on">{t("on")}</SelectItem>
              <SelectItem value="off">{t("off")}</SelectItem>
            </SelectContent>
          </Select>
          {settings.mayConfigureDefault ? null : (
            <ReadOnlyReason>
              {settings.mayConfigure
                ? t("defaultNeedsReach")
                : configuration("readOnly", {
                    permission: permissions("configureAccommodation"),
                  })}
            </ReadOnlyReason>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="inspection-property">{t("thisProperty")}</Label>
          <Select
            disabled={!settings.mayConfigure || pending}
            onValueChange={(value) => setPropertyDraft(value as PropertyChoice)}
            value={propertyValue}
          >
            <SelectTrigger
              className={WRAPPING_TRIGGER}
              id="inspection-property"
            >
              {/* Named here rather than left to the closed Select to find:
                  on first render it has no mounted item to read a label
                  from, and would show nothing. */}
              <SelectValue>
                {propertyValue === "default"
                  ? inheritLabel
                  : onOff(propertyValue === "on")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{inheritLabel}</SelectItem>
              <SelectItem value="on">{t("on")}</SelectItem>
              <SelectItem value="off">{t("off")}</SelectItem>
            </SelectContent>
          </Select>
          {settings.mayConfigure ? null : (
            <ReadOnlyReason>
              {configuration("readOnly", {
                permission: permissions("configureAccommodation"),
              })}
            </ReadOnlyReason>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("flow")}
        </span>
        <ol className="flex flex-wrap items-center gap-2" data-testid="flow">
          <li>
            <HousekeepingStatusBadge status="dirty" />
          </li>
          <Step />
          <li>
            <HousekeepingStatusBadge status="clean" />
          </li>
          {effective ? (
            <>
              <Step />
              <li>
                <HousekeepingStatusBadge status="inspected" />
              </li>
            </>
          ) : null}
          <Step />
          <li>
            <StatusBadge
              icon={CalendarCheck}
              label={t("flowReady")}
              tone="success"
            />
          </li>
        </ol>
      </div>

      {settings.mayConfigure || settings.mayConfigureDefault ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {settings.mayConfigure ? (
            <Button
              disabled={!propertyChanged || pending}
              onClick={() => save("property")}
              type="button"
            >
              {configuration("saveForProperty")}
            </Button>
          ) : null}
          {settings.mayConfigureDefault ? (
            <Button
              disabled={!organizationChanged || pending}
              onClick={() => setConfirming(true)}
              type="button"
              variant="outline"
            >
              {configuration("saveForOrganization")}
            </Button>
          ) : null}
          {dirty ? (
            <>
              <Button
                disabled={pending}
                onClick={discard}
                type="button"
                variant="ghost"
              >
                {configuration("discardChanges")}
              </Button>
              <p className="text-step--1 text-muted-foreground">
                {configuration("draftNote")}
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      <Dialog onOpenChange={setConfirming} open={confirming}>
        <DialogContent className={dialogFrameClassName("small")}>
          <DialogMasthead
            art="/illustrations/dialogs/inspection.svg"
            eyebrow={configuration("confirmOrgTitle")}
            heading={t("inspectionTitle")}
          />
          <DialogBody simple>
            <DialogDescription className="m-0 text-sm">
              {configuration("orgChangeLine", {
                setting: t("inspectionTitle"),
                from: onOff(savedOrganization),
                to: onOff(organizationValue),
              })}
            </DialogDescription>
            <DefaultReachLines reach={settings.defaultReach} />
          </DialogBody>
          <DialogActions>
            <CancelButton onClick={() => setConfirming(false)} type="button">
              {configuration("keepEditing")}
            </CancelButton>
            <ArrowButton
              onClick={() => {
                setConfirming(false);
                save("organization");
              }}
              type="button"
            >
              {configuration("confirmOrgChange")}
            </ArrowButton>
          </DialogActions>
        </DialogContent>
      </Dialog>

      <div aria-live="polite" className="min-h-5">
        {pending ? (
          <p className="text-step--1 text-muted-foreground">{t("saving")}</p>
        ) : outcome.status === "done" && !dirty ? (
          <p className="text-step--1 text-success">{t("saved")}</p>
        ) : outcome.status === "refused" || outcome.status === "invalid" ? (
          <FormError>{t("settingRefused")}</FormError>
        ) : null}
      </div>
    </>
  );

  if (embedded) return <div className="grid gap-5">{body}</div>;

  return (
    <Card className="grid gap-5 p-5">
      <div className="grid gap-1">
        <h2 className="text-step-0 font-semibold">{t("inspectionTitle")}</h2>
        <p className="max-w-prose text-step--1 text-muted-foreground">
          {t("inspectionHint")}
        </p>
      </div>
      {body}
    </Card>
  );
}

/** Why a control is not yours, beside the control, where the reader's eye already is. */
function ReadOnlyReason({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-step--1 text-muted-foreground">
      <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      {children}
    </p>
  );
}

/** An arrow that points the way the text runs, so Arabic reads right to left. */
function Step() {
  return (
    <li aria-hidden="true" className="text-muted-foreground">
      <ArrowRight className="size-4 rtl:-scale-x-100" />
    </li>
  );
}
