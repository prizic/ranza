"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { bedLetters, roomNumbers } from "../../../server/room-numbers";
import {
  ArrowButton,
  Button,
  CancelButton,
  ChoiceGroup,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  DialogNotice,
  DialogSection,
  DialogTrigger,
  Field,
  FormError,
  Input,
  TickRow,
  dialogFrameClassName,
  fieldClassName,
} from "@ranza/ui";
import { addRooms, type AddRoomsOutcome } from "../../../server/accommodation";

/** Bounds restated from `@ranza/accommodation`, which the browser cannot import. */
const BATCH_MAX = 60;
const CAPACITY_MAX = 64;
const BEDS_MAX = 26;
const FLOOR_RANGE = { min: -20, max: 200 } as const;
const BUILDING_MAX = 60;
const NUMBER_PATTERN = /^[0-9]{1,8}$/;

type Added = Extract<AddRoomsOutcome, { status: "done" }>;

interface Draft {
  building: string;
  floor: string;
  unitType: string;
  firstNumber: string;
  count: string;
  capacity: string;
  letByTheBed: boolean;
}

const BLANK: Draft = {
  building: "",
  floor: "",
  unitType: "room",
  firstNumber: "",
  count: "1",
  capacity: "2",
  letByTheBed: false,
};

/**
 * Add rooms in one go (RB-S2-01). A press writes the whole batch and a room
 * cannot be renamed or deleted afterwards (RB-S3-12), so the form says what it
 * is about to create before the press, in the same words it will use after.
 *
 * Offered only to somebody who holds `accommodation.configure`; the outcome
 * still names the permission for anyone who reaches the form another way.
 */
export function AddRoomsDialog({
  locale,
  propertyId,
  onAdded,
}: {
  locale: string;
  propertyId: string;
  /** The batch just created, for the screen to say so once the dialog closes. */
  onAdded: (added: Added) => void;
}) {
  const t = useTranslations("roomsPage");
  const all = useTranslations();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [pending, setPending] = useState(false);

  const dirty = (Object.keys(BLANK) as (keyof Draft)[]).some(
    (key) => draft[key] !== BLANK[key],
  );

  function requestOpenChange(next: boolean) {
    // Escape and a click outside close a dialog without asking, and a form
    // with a batch typed into it is worth a question (ROOMS-05).
    if (!next && dirty && !pending && !window.confirm(t("discardDraft"))) {
      return;
    }
    if (!next) setDraft(BLANK);
    setOpen(next);
  }

  function added(outcome: Added) {
    setDraft(BLANK);
    setOpen(false);
    onAdded(outcome);
  }

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2" data-testid="add-rooms-open" size="sm">
          <Plus aria-hidden="true" className="size-4" />
          {all("addRooms")}
        </Button>
      </DialogTrigger>
      <DialogContent className={dialogFrameClassName("medium")}>
        <AddRoomsForm
          draft={draft}
          locale={locale}
          onAdded={added}
          onCancel={() => {
            setDraft(BLANK);
            setOpen(false);
          }}
          onDraft={setDraft}
          onPending={setPending}
          propertyId={propertyId}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddRoomsForm({
  draft,
  locale,
  onAdded,
  onCancel,
  onDraft,
  onPending,
  propertyId,
}: {
  draft: Draft;
  locale: string;
  onAdded: (added: Added) => void;
  onCancel: () => void;
  onDraft: (draft: Draft) => void;
  onPending: (pending: boolean) => void;
  propertyId: string;
}) {
  const t = useTranslations("roomsPage");
  const all = useTranslations();
  const [outcome, act, pending] = useActionState<AddRoomsOutcome, FormData>(
    addRooms,
    { status: "idle" },
  );

  useEffect(() => {
    onPending(pending);
  }, [onPending, pending]);

  // The latest callback, read when the outcome lands: the outcome is what
  // triggers it, and a parent that re-renders must not trigger it again.
  const announce = useRef(onAdded);
  useEffect(() => {
    announce.current = onAdded;
  });
  useEffect(() => {
    if (outcome.status === "done") announce.current(outcome);
  }, [outcome]);

  const set = (patch: Partial<Draft>) => onDraft({ ...draft, ...patch });
  const capacityMax = draft.letByTheBed ? BEDS_MAX : CAPACITY_MAX;
  const preview = previewOf(draft);

  return (
    <form action={act} className="grid">
      <DialogMasthead
        art="/illustrations/dialogs/add-rooms.svg"
        eyebrow={all("addRooms")}
        heading={t("addHeading")}
        large
      />
      <DialogBody>
        <DialogDescription className="sr-only">
          {t("addDescription")}
        </DialogDescription>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="propertyId" value={propertyId} />

        <DialogSection title={t("addWhatTitle")} titleId="add-rooms-what">
          <ChoiceGroup
            labelledBy="add-rooms-what"
            name="unitType"
            onChange={(unitType) =>
              set({
                unitType,
                letByTheBed: unitType === "room" ? draft.letByTheBed : false,
              })
            }
            options={[
              { label: all("unitType.room"), value: "room" },
              { label: all("unitType.apartment"), value: "apartment" },
              { label: all("unitType.suite"), value: "suite" },
            ]}
            value={draft.unitType}
          />
          <Field htmlFor="capacity" label={all("capacityPerRoom")}>
            <Input
              className={fieldClassName}
              id="capacity"
              max={capacityMax}
              min={1}
              name="capacity"
              onChange={(event) => set({ capacity: event.target.value })}
              required
              type="number"
              value={draft.capacity}
              {...saysInOwnWords(t("capacityInvalid", { max: capacityMax }))}
            />
          </Field>
          <TickRow
            checked={draft.letByTheBed}
            disabled={draft.unitType !== "room"}
            id="letByTheBed"
            name="letByTheBed"
            onCheckedChange={(letByTheBed) => set({ letByTheBed })}
            value="on"
          >
            <b className="block font-medium">{all("letByTheBed")}</b>
            <span className="block text-step--1 text-muted-foreground">
              {all("letByTheBedHint")}
            </span>
          </TickRow>
        </DialogSection>

        <DialogSection
          hint={t("firstNumberHint")}
          tag={{ label: all("dialogTagRequired"), required: true }}
          title={t("addNumbersTitle")}
        >
          <div className="grid grid-cols-2 items-start gap-4">
            <Field htmlFor="firstNumber" label={all("firstNumber")}>
              <Input
                className={fieldClassName}
                id="firstNumber"
                inputMode="numeric"
                name="firstNumber"
                onChange={(event) => set({ firstNumber: event.target.value })}
                pattern={NUMBER_PATTERN.source}
                placeholder="101"
                required
                value={draft.firstNumber}
                {...saysInOwnWords(t("firstNumberInvalid"))}
              />
            </Field>
            <Field htmlFor="count" label={all("roomCount")}>
              <Input
                className={fieldClassName}
                id="count"
                max={BATCH_MAX}
                min={1}
                name="count"
                onChange={(event) => set({ count: event.target.value })}
                required
                type="number"
                value={draft.count}
                {...saysInOwnWords(t("countInvalid"))}
              />
            </Field>
          </div>
        </DialogSection>

        <DialogSection
          tag={{ label: all("dialogTagOptional"), required: false }}
          title={t("addWhereTitle")}
        >
          <div className="grid grid-cols-2 items-start gap-4">
            <Field htmlFor="building" label={all("building")}>
              <Input
                className={fieldClassName}
                id="building"
                maxLength={BUILDING_MAX}
                name="building"
                onChange={(event) => set({ building: event.target.value })}
                placeholder="Main"
                value={draft.building}
              />
            </Field>
            <Field htmlFor="floor" label={all("floor")}>
              <Input
                className={fieldClassName}
                id="floor"
                max={FLOOR_RANGE.max}
                min={FLOOR_RANGE.min}
                name="floor"
                onChange={(event) => set({ floor: event.target.value })}
                placeholder="1"
                type="number"
                value={draft.floor}
                {...saysInOwnWords(t("floorInvalid"))}
              />
            </Field>
          </div>
        </DialogSection>

        <div className="py-5">
          <div aria-live="polite" data-testid="add-rooms-preview">
            <DialogNotice>
              {preview ? (
                <PreviewLine draft={draft} preview={preview} />
              ) : (
                t("previewIncomplete")
              )}
            </DialogNotice>
          </div>
          <OutcomeError
            capacityMax={capacityMax}
            outcome={outcome}
            permission={all("staff.permissions.configureAccommodation")}
            t={t}
          />
        </div>
      </DialogBody>

      <DialogActions hint={preview ? null : t("addHintFirstNumber")}>
        <CancelButton disabled={pending} onClick={onCancel} type="button">
          {all("discardBooking")}
        </CancelButton>
        <ArrowButton disabled={pending || !preview} type="submit">
          {pending
            ? all("addingRooms")
            : preview
              ? t("addCount", { count: preview.count })
              : all("addRooms")}
        </ArrowButton>
      </DialogActions>
    </form>
  );
}

interface Preview {
  count: number;
  names: string[];
}

/** The rooms a press would create, or nothing while the numbers say none. */
function previewOf(draft: Draft): Preview | null {
  const count = Number(draft.count);
  if (!NUMBER_PATTERN.test(draft.firstNumber)) return null;
  if (!Number.isInteger(count) || count < 1 || count > BATCH_MAX) return null;
  return { count, names: roomNumbers(draft.firstNumber, count) };
}

function PreviewLine({ draft, preview }: { draft: Draft; preview: Preview }) {
  const t = useTranslations("roomsPage");
  const capacity = Number(draft.capacity);
  const building = draft.building.trim();
  const floor = draft.floor === "" ? null : Number(draft.floor);
  const beds = draft.letByTheBed && Number.isInteger(capacity) && capacity > 0;

  const parts = [
    t("previewRange", {
      count: preview.count,
      first: preview.names[0] ?? "",
      last: preview.names.at(-1) ?? "",
    }),
    ...(floor !== null && Number.isFinite(floor)
      ? [t("previewFloor", { floor })]
      : []),
    ...(building ? [building] : []),
    ...(beds
      ? [
          t("previewBeds", {
            count: capacity,
            last: bedLetters(Math.min(capacity, BEDS_MAX)).at(-1) ?? "A",
          }),
        ]
      : Number.isInteger(capacity) && capacity > 0
        ? [t("previewSleeps", { count: capacity })]
        : []),
  ];
  return <>{parts.join(", ")}</>;
}

function OutcomeError({
  capacityMax,
  outcome,
  permission,
  t,
}: {
  capacityMax: number;
  outcome: AddRoomsOutcome;
  permission: string;
  t: ReturnType<typeof useTranslations<"roomsPage">>;
}): ReactNode {
  switch (outcome.status) {
    case "taken":
      return <FormError>{t("taken", { name: outcome.name })}</FormError>;
    case "notPermitted":
      return <FormError>{t("notPermitted", { permission })}</FormError>;
    case "refused":
      return <FormError>{t("refused")}</FormError>;
    case "invalid":
      return (
        <FormError>
          {outcome.field === "firstNumber"
            ? t("firstNumberInvalid")
            : outcome.field === "count"
              ? t("countInvalid")
              : outcome.field === "capacity"
                ? t("capacityInvalid", { max: capacityMax })
                : outcome.field === "floor"
                  ? t("floorInvalid")
                  : outcome.field === "building"
                    ? t("buildingInvalid")
                    : outcome.field === "letByTheBed"
                      ? t("bedsOnlyRoom")
                      : t("invalidGeneric")}
        </FormError>
      );
    default:
      return null;
  }
}

/**
 * The browser's own bubble says "Please match the requested format" in the
 * browser's language, which is not the screen's. Setting the message when a
 * field is found invalid, and clearing it as soon as the person types, makes
 * the bubble say this screen's words in this screen's language (ROOMS-04).
 */
function saysInOwnWords(message: string) {
  return {
    onInvalid: (event: FormEvent<HTMLInputElement>) =>
      event.currentTarget.setCustomValidity(message),
    onInput: (event: FormEvent<HTMLInputElement>) =>
      event.currentTarget.setCustomValidity(""),
  };
}
