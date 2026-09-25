"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { isSupportedLocale } from "@ranza/i18n";
import { MaintenanceInputError } from "@ranza/maintenance";
import type {
  ChargeableStay,
  OutOfOrderImpact,
  RequestStatus,
  ReturnAs,
  SettingOverrides,
} from "@ranza/maintenance";
import { toMinorUnits } from "../lib/amount";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * Working maintenance requests from the Workspace (RANZ-33).
 *
 * Every command goes through the composition root under the acting user's
 * context (ADR 0007), and the policies decide whether it lands (ADR 0012), so
 * nothing here checks a permission. An outcome carries no English: the
 * component chooses the copy from `status`.
 */

export type MaintenanceOutcomeStatus =
  | "idle"
  | "done"
  | "invalid"
  | "refused"
  /** Somebody moved the request first (MT-S1-14); `current` says where to. */
  | "moved"
  /** Taking the room out affects somebody; `impact` says who (MT-S2-09). */
  | "impact"
  /** A blocked room is not taken out of order (MT-S2-08). */
  | "blocked"
  /** The setting asks for an assignee before work starts (MT-S2-25). */
  | "needsAssignee"
  /** The assignee does not reach the Property (MT-S1-19). */
  | "outOfReach"
  /** Letting go of a room needs maintenance.take_out_of_order. */
  | "needsReturnPermission";

export interface MaintenanceOutcome {
  status: MaintenanceOutcomeStatus;
  current?: RequestStatus;
  impact?: OutOfOrderImpact;
  /** After a move to done: the room came back, or is still out of order. */
  returned?: boolean;
  stillOutOfOrder?: boolean;
  /** After a return: this request let go, and another still holds the room. */
  heldElsewhere?: boolean;
  /** After a report: the number it was given. */
  number?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Matched by name as well, because a server bundle may hold two copies. */
function named(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

/**
 * What a refused command becomes. Unknown errors are rethrown: a failure this
 * does not recognise is a defect, not an outcome to show as a refusal.
 */
function outcomeOf(error: unknown): MaintenanceOutcome {
  if (named(error, "MaintenanceInputError")) return { status: "invalid" };
  if (named(error, "MaintenanceRefusedError")) return { status: "refused" };
  if (named(error, "RequestMovedError")) {
    return {
      status: "moved",
      current: (error as Error & { current: RequestStatus }).current,
    };
  }
  if (named(error, "OutOfOrderImpactError")) {
    return {
      status: "impact",
      impact: (error as Error & { impact: OutOfOrderImpact }).impact,
    };
  }
  if (named(error, "UnitBlockedError")) return { status: "blocked" };
  if (named(error, "AssigneeRequiredError")) return { status: "needsAssignee" };
  if (named(error, "AssigneeOutOfReachError")) return { status: "outOfReach" };
  if (named(error, "ReleaseNeedsPermissionError")) {
    return { status: "needsReturnPermission" };
  }
  throw error;
}

/**
 * The board, and every screen that reads whether a room is in service: Rooms
 * shows it, arrivals refuses a check-in into it, and a returned room turns up
 * on the housekeeping board.
 */
function revalidateMaintenance(locale: string): void {
  revalidatePath(`/${locale}/maintenance`);
  revalidatePath(`/${locale}/rooms`);
  revalidatePath(`/${locale}/arrivals`);
  revalidatePath(`/${locale}/housekeeping`);
}

/**
 * Runs one command for the signed-in viewer, with the locale and the ids the
 * form must carry checked first. A malformed form is "invalid", never a cast
 * error surfacing as a crash.
 */
async function run(
  form: FormData,
  ids: readonly string[],
  command: (userId: string) => Promise<Partial<MaintenanceOutcome>>,
): Promise<MaintenanceOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return { status: "invalid" };
  if (!ids.every((id) => UUID.test(id))) return { status: "invalid" };

  try {
    const result = await command(viewer.userId);
    revalidateMaintenance(locale);
    return { status: "done", ...result };
  } catch (error: unknown) {
    const outcome = outcomeOf(error);
    // A refusal usually means the page is older than the truth: a permission
    // taken away, or a request moved. The next read shows what is true now.
    if (outcome.status !== "invalid" && outcome.status !== "impact") {
      revalidateMaintenance(locale);
    }
    return outcome;
  }
}

function text(form: FormData, field: string): string {
  return String(form.get(field) ?? "");
}

function optional(form: FormData, field: string): string | null {
  const value = text(form, field).trim();
  return value === "" ? null : value;
}

/** Report a problem, taking the room out of order when asked (MT-S1-01). */
export async function reportProblem(
  _previous: MaintenanceOutcome,
  form: FormData,
): Promise<MaintenanceOutcome> {
  const propertyId = text(form, "propertyId");
  const unitId = optional(form, "unitId");
  const equipmentId = optional(form, "equipmentId");
  const assigneeId = optional(form, "assigneeId");
  const outOfOrder = form.get("outOfOrder") === "on";

  return run(
    form,
    [
      propertyId,
      ...(unitId ? [unitId] : []),
      ...(equipmentId ? [equipmentId] : []),
      ...(assigneeId ? [assigneeId] : []),
    ],
    async (userId) => {
      const reported = await getComposition().maintenance.report(userId, {
        propertyId,
        unitId,
        equipmentId,
        title: text(form, "title"),
        details: optional(form, "details"),
        priority: text(form, "priority"),
        assigneeId,
        outOfOrder: outOfOrder
          ? {
              expectedBackOn: optional(form, "expectedBackOn"),
              acknowledged: form.get("acknowledge") === "true",
            }
          : null,
      });
      return { number: reported.number };
    },
  );
}

/** Move a request between board states, or reopen a cancelled one. */
export async function moveRequest(
  _previous: MaintenanceOutcome,
  form: FormData,
): Promise<MaintenanceOutcome> {
  const requestId = text(form, "requestId");
  const to = text(form, "to");
  return run(form, [requestId], async (userId) => {
    const moved = await getComposition().maintenance.move(userId, {
      requestId,
      from: text(form, "from"),
      to,
    });
    // "Still out of order" is news only on a move to done: any other move of
    // a request that holds its room leaves it held, as it was.
    return {
      returned: moved.returned,
      stillOutOfOrder: to === "done" && moved.stillOutOfOrder,
      heldElsewhere: moved.heldElsewhere,
    };
  });
}

/** Cancel an open request with a reason (MT-S1-15, MT-S2-16). */
export async function cancelRequest(
  _previous: MaintenanceOutcome,
  form: FormData,
): Promise<MaintenanceOutcome> {
  const requestId = text(form, "requestId");
  return run(form, [requestId], (userId) =>
    getComposition().maintenance.cancel(userId, {
      requestId,
      from: text(form, "from"),
      reason: text(form, "reason"),
    }),
  );
}

/** Assign a request, or unassign it with an empty value (MT-S1-18). */
export async function assignRequest(
  _previous: MaintenanceOutcome,
  form: FormData,
): Promise<MaintenanceOutcome> {
  const requestId = text(form, "requestId");
  const assigneeId = optional(form, "assigneeId");
  return run(
    form,
    [requestId, ...(assigneeId ? [assigneeId] : [])],
    async (userId) => {
      await getComposition().maintenance.assign(userId, {
        requestId,
        assigneeId,
      });
      return {};
    },
  );
}

/** Change how urgent a request is (MT-S1-21). */
export async function prioritiseRequest(
  _previous: MaintenanceOutcome,
  form: FormData,
): Promise<MaintenanceOutcome> {
  const requestId = text(form, "requestId");
  return run(form, [requestId], async (userId) => {
    await getComposition().maintenance.prioritise(userId, {
      requestId,
      priority: text(form, "priority"),
    });
    return {};
  });
}

/** Take an open request's room out of order (MT-S2-02). */
export async function takeRoomOutOfOrder(
  _previous: MaintenanceOutcome,
  form: FormData,
): Promise<MaintenanceOutcome> {
  const requestId = text(form, "requestId");
  return run(form, [requestId], async (userId) => {
    await getComposition().maintenance.takeOutOfOrder(userId, {
      requestId,
      expectedBackOn: optional(form, "expectedBackOn"),
      acknowledged: form.get("acknowledge") === "true",
    });
    return {};
  });
}

/** Return a request's room to service, with an optional note (MT-S2-21). */
export async function returnRoomToService(
  _previous: MaintenanceOutcome,
  form: FormData,
): Promise<MaintenanceOutcome> {
  const requestId = text(form, "requestId");
  return run(form, [requestId], async (userId) => {
    const { returned, heldElsewhere } =
      await getComposition().maintenance.returnToService(userId, {
        requestId,
        note: optional(form, "note"),
      });
    return { returned, heldElsewhere };
  });
}

/** `default`, `on` or `off` as the form sends it; null follows the default. */
function toggle(value: string): boolean | null {
  if (value === "on") return true;
  if (value === "off") return false;
  return null;
}

function returnAs(value: string): ReturnAs | null {
  return value === "dirty" || value === "clean" || value === "inspected"
    ? value
    : null;
}

/**
 * Change the Maintenance setting: this Property's overrides, or the
 * Organization default named through it (MT-S2-22, MT-S2-23).
 */
export async function saveMaintenanceSettings(
  _previous: MaintenanceOutcome,
  form: FormData,
): Promise<MaintenanceOutcome> {
  const propertyId = text(form, "propertyId");
  const values: SettingOverrides = {
    assigneeRequired: toggle(text(form, "assigneeRequired")),
    returnOnDone: toggle(text(form, "returnOnDone")),
    returnAs: returnAs(text(form, "returnAs")),
  };

  return run(form, [propertyId], async (userId) => {
    const maintenance = getComposition().maintenance;
    if (text(form, "scope") !== "organization") {
      await maintenance.setPropertySettings(userId, propertyId, values);
      return {};
    }
    // The default has nothing to follow, so every field says something.
    const { assigneeRequired, returnOnDone } = values;
    if (
      assigneeRequired === null ||
      returnOnDone === null ||
      values.returnAs === null
    ) {
      throw new MaintenanceInputError("the default answers every question");
    }
    await maintenance.setOrganizationSettings(userId, propertyId, {
      assigneeRequired,
      returnOnDone,
      returnAs: values.returnAs,
    });
    return {};
  });
}

function interval(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** Register an item, or change one when `equipmentId` is sent (MT-S3-01, MT-S3-05). */
export async function saveEquipment(
  _previous: MaintenanceOutcome,
  form: FormData,
): Promise<MaintenanceOutcome> {
  const propertyId = text(form, "propertyId");
  const equipmentId = optional(form, "equipmentId");
  const atRoom = text(form, "where") === "room";
  const unitId = atRoom ? optional(form, "unitId") : null;
  return run(
    form,
    [
      propertyId,
      ...(equipmentId ? [equipmentId] : []),
      ...(unitId ? [unitId] : []),
    ],
    async (userId) => {
      const input = {
        name: text(form, "name"),
        category: text(form, "category"),
        unitId,
        location: atRoom ? null : optional(form, "location"),
        serviceIntervalMonths: interval(text(form, "interval")),
        lastServicedOn: optional(form, "lastServicedOn"),
      };
      const maintenance = getComposition().maintenance;
      if (equipmentId) {
        await maintenance.changeEquipment(userId, equipmentId, {
          ...input,
          lastServicedOnWas: optional(form, "lastServicedOnWas"),
        });
      } else {
        await maintenance.addEquipment(userId, propertyId, input);
      }
      return {};
    },
  );
}

/** Retire an item, or restore one (MT-S3-06). */
export async function setEquipmentRetired(
  _previous: MaintenanceOutcome,
  form: FormData,
): Promise<MaintenanceOutcome> {
  const equipmentId = text(form, "equipmentId");
  const retired = form.get("retired") === "true";
  return run(form, [equipmentId], async (userId) => {
    const maintenance = getComposition().maintenance;
    if (retired) await maintenance.retireEquipment(userId, equipmentId);
    else await maintenance.restoreEquipment(userId, equipmentId);
    return {};
  });
}

/**
 * Raise a work order for an item (MT-S4-02), titled in the reader's language
 * with the item's name.
 */
export async function createWorkOrder(
  _previous: MaintenanceOutcome,
  form: FormData,
): Promise<MaintenanceOutcome> {
  const equipmentId = text(form, "equipmentId");
  const locale = text(form, "locale");
  return run(form, [equipmentId], async (userId) => {
    if (!isSupportedLocale(locale)) throw new MaintenanceInputError("locale");
    const t = await getTranslations({ locale, namespace: "maintenance" });
    const reported = await getComposition().maintenance.createWorkOrder(
      userId,
      {
        equipmentId,
        title: t("workOrderTitle", { name: text(form, "name") }),
      },
    );
    return { number: reported.number };
  });
}

/** Record what a repair cost and who did it (MT-S5-01). */
export async function recordRepairCost(
  _previous: MaintenanceOutcome,
  form: FormData,
): Promise<MaintenanceOutcome> {
  const requestId = text(form, "requestId");
  return run(form, [requestId], async (userId) => {
    const typed = text(form, "cost").trim();
    const currency = text(form, "currency");
    const costMinor = typed === "" ? null : toMinorUnits(typed, currency);
    if (typed !== "" && costMinor === null) {
      throw new MaintenanceInputError("a cost is an amount");
    }
    await getComposition().maintenance.recordCost(userId, {
      requestId,
      costMinor,
      currency,
      vendor: optional(form, "vendor"),
    });
    return {};
  });
}

/** Charge a Guest for damage (MT-S5-03). */
export async function chargeGuestForDamage(
  _previous: MaintenanceOutcome,
  form: FormData,
): Promise<MaintenanceOutcome> {
  const requestId = text(form, "requestId");
  const folioId = text(form, "folioId");
  return run(form, [requestId, folioId], async (userId) => {
    const currency = text(form, "currency");
    const amountMinor = toMinorUnits(text(form, "amount"), currency);
    if (amountMinor === null || amountMinor <= 0) {
      throw new MaintenanceInputError("a charge is a positive amount");
    }
    await getComposition().maintenance.chargeGuest(userId, {
      requestId,
      folioId,
      amountMinor,
      currency,
    });
    return {};
  });
}

/**
 * The Stays a damage charge may go on, read when the charge form opens rather
 * than for every card on the board (MT-S5-07). Empty for anything malformed or
 * refused: the form then says nobody can be charged.
 */
export async function loadChargeableStays(
  requestId: string,
): Promise<ChargeableStay[]> {
  const viewer = await currentViewer();
  if (!viewer || !UUID.test(requestId)) return [];
  return getComposition().maintenance.chargeableStays(viewer.userId, requestId);
}
