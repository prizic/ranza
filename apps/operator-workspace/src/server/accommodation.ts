"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import {
  UnitConfigurationError,
  UnitNameTakenError,
  UnitOccupiedError,
  UnitRefusedError,
  type AccommodationUnitType,
  type NewUnits,
} from "@ranza/accommodation";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * Server actions for Rooms & beds (RANZ-27).
 *
 * Every mutation goes through the composition root and uses the acting user's
 * session context (ADR 0007). Row-level security and triggers enforce authorization
 * and operational constraints (ADR 0012).
 */

export interface AddRoomsOutcome {
  status: "idle" | "done" | "taken" | "invalid" | "refused";
  message?: string;
}

export interface BlockOutcome {
  status: "idle" | "done" | "occupied" | "invalid" | "refused";
  message?: string;
}

function revalidateRooms(locale: string): void {
  revalidatePath(`/${locale}/rooms`);
  revalidatePath(`/${locale}/reservations`);
  revalidatePath(`/${locale}/arrivals`);
}

export async function addRooms(
  _previous: AddRoomsOutcome,
  form: FormData,
): Promise<AddRoomsOutcome> {
  const viewer = await currentViewer();
  if (!viewer)
    return { status: "refused", message: "those rooms cannot be added" };

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale))
    return { status: "refused", message: "those rooms cannot be added" };

  const propertyId = String(form.get("propertyId") ?? "");
  const building = String(form.get("building") ?? "").trim() || null;
  const floorRaw = form.get("floor");
  const floor = floorRaw !== null && floorRaw !== "" ? Number(floorRaw) : null;
  const unitType = String(
    form.get("unitType") ?? "room",
  ) as AccommodationUnitType;
  const firstNumber = String(form.get("firstNumber") ?? "");
  const count = Number(form.get("count") ?? 1);
  const capacity = Number(form.get("capacity") ?? 1);
  const letByTheBed =
    form.get("letByTheBed") === "on" || form.get("letByTheBed") === "true";

  const input: NewUnits = {
    propertyId,
    building,
    floor,
    unitType,
    firstNumber,
    count,
    capacity,
    letByTheBed,
  };

  try {
    const { accommodation } = getComposition();
    await accommodation.addUnits(viewer.userId, input);
    revalidateRooms(locale);
    return { status: "done" };
  } catch (error: unknown) {
    if (error instanceof UnitNameTakenError) {
      return { status: "taken", message: error.message };
    }
    if (error instanceof UnitConfigurationError) {
      return { status: "invalid", message: error.message };
    }
    if (error instanceof UnitRefusedError) {
      return { status: "refused", message: error.message };
    }
    throw error;
  }
}

export async function blockUnit(
  _previous: BlockOutcome,
  form: FormData,
): Promise<BlockOutcome> {
  const viewer = await currentViewer();
  if (!viewer)
    return {
      status: "refused",
      message: "that Accommodation Unit cannot be blocked",
    };

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale))
    return {
      status: "refused",
      message: "that Accommodation Unit cannot be blocked",
    };

  const unitId = String(form.get("unitId") ?? "");
  const reason = String(form.get("reason") ?? "").trim();

  try {
    const { accommodation } = getComposition();
    await accommodation.blockUnit(viewer.userId, unitId, reason);
    revalidateRooms(locale);
    return { status: "done" };
  } catch (error: unknown) {
    if (error instanceof UnitOccupiedError) {
      return { status: "occupied", message: error.message };
    }
    if (error instanceof UnitConfigurationError) {
      return { status: "invalid", message: error.message };
    }
    if (error instanceof UnitRefusedError) {
      return { status: "refused", message: error.message };
    }
    throw error;
  }
}

export async function unblockUnit(
  _previous: BlockOutcome,
  form: FormData,
): Promise<BlockOutcome> {
  const viewer = await currentViewer();
  if (!viewer)
    return {
      status: "refused",
      message: "that Accommodation Unit cannot be unblocked",
    };

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale))
    return {
      status: "refused",
      message: "that Accommodation Unit cannot be unblocked",
    };

  const unitId = String(form.get("unitId") ?? "");

  try {
    const { accommodation } = getComposition();
    await accommodation.unblockUnit(viewer.userId, unitId);
    revalidateRooms(locale);
    return { status: "done" };
  } catch (error: unknown) {
    if (error instanceof UnitRefusedError) {
      return { status: "refused", message: error.message };
    }
    throw error;
  }
}
