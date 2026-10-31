"use server";

import { revalidatePath } from "next/cache";
import { GENDERS, type Gender } from "@ranza/core";
import { isSupportedLocale } from "@ranza/i18n";
import {
  RoomStillHoldsSomeoneError,
  UnitConfigurationError,
  UnitNameTakenError,
  UnitOccupiedError,
  UnitRefusedError,
  type AccommodationUnitType,
  type NewUnits,
  type UnitConfigurationField,
} from "@ranza/accommodation";
import { getComposition } from "./composition";
import { currentViewer, mayConfigureRooms } from "./viewer";

/**
 * Server actions for Rooms & beds (RANZ-27).
 *
 * Every mutation goes through the composition root and uses the acting user's
 * session context (ADR 0007). Row-level security and triggers enforce authorization
 * and operational constraints (ADR 0012).
 */

/**
 * What an add came to. It carries facts, never sentences: the screen words
 * each outcome in the viewer's language, and names the room or the input the
 * person can change (ROOMS-03, ROOMS-04).
 */
export type AddRoomsOutcome =
  | { status: "idle" }
  | {
      status: "done";
      first: string;
      last: string;
      count: number;
      bedCount: number;
    }
  | { status: "taken"; name: string }
  | { status: "invalid"; field: UnitConfigurationField | null }
  | { status: "notPermitted" }
  | { status: "refused" };

/**
 * What changing whom a room admits came to (RB-S5-13): `stillHeld` when
 * somebody booked or in house would no longer be admitted (RB-S5-08).
 */
export type RoomAdmitsOutcome = {
  status: "idle" | "done" | "stillHeld" | "invalid" | "refused";
};

export interface BlockOutcome {
  status: "idle" | "done" | "occupied" | "invalid" | "refused";
  message?: string;
}

function revalidateRooms(locale: string): void {
  revalidatePath(`/${locale}/rooms`);
  revalidatePath(`/${locale}/reservations`);
  revalidatePath(`/${locale}/arrivals`);
}

function isUnitNameTakenError(error: unknown): error is UnitNameTakenError {
  return (
    error instanceof UnitNameTakenError ||
    (error instanceof Error && error.name === "UnitNameTakenError")
  );
}

function isUnitConfigurationError(
  error: unknown,
): error is UnitConfigurationError {
  return (
    error instanceof UnitConfigurationError ||
    (error instanceof Error && error.name === "UnitConfigurationError")
  );
}

function isUnitRefusedError(error: unknown): error is UnitRefusedError {
  return (
    error instanceof UnitRefusedError ||
    (error instanceof Error && error.name === "UnitRefusedError")
  );
}

function isRoomStillHoldsSomeoneError(
  error: unknown,
): error is RoomStillHoldsSomeoneError {
  return (
    error instanceof RoomStillHoldsSomeoneError ||
    (error instanceof Error && error.name === "RoomStillHoldsSomeoneError")
  );
}

/**
 * Whom a room admits, as a form sends it: empty for anyone, `undefined` for a
 * value this screen never sends.
 */
function admitsOf(form: FormData): Gender | null | undefined {
  const value = String(form.get("admits") ?? "");
  if (value === "") return null;
  return (GENDERS as readonly string[]).includes(value)
    ? (value as Gender)
    : undefined;
}

function isUnitOccupiedError(error: unknown): error is UnitOccupiedError {
  return (
    error instanceof UnitOccupiedError ||
    (error instanceof Error && error.name === "UnitOccupiedError")
  );
}

export async function addRooms(
  _previous: AddRoomsOutcome,
  form: FormData,
): Promise<AddRoomsOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return { status: "refused" };

  const propertyId = String(form.get("propertyId") ?? "");
  if (!(await mayConfigureRooms(propertyId))) {
    return { status: "notPermitted" };
  }

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
  const admits = admitsOf(form);
  if (admits === undefined) return { status: "invalid", field: "admits" };

  const input: NewUnits = {
    propertyId,
    building,
    floor,
    unitType,
    firstNumber,
    count,
    capacity,
    letByTheBed,
    admits,
  };

  try {
    const { accommodation } = getComposition();
    const added = await accommodation.addUnits(viewer.userId, input);
    revalidateRooms(locale);
    return {
      status: "done",
      first: added.names[0] ?? firstNumber,
      last: added.names.at(-1) ?? firstNumber,
      count: added.names.length,
      bedCount: added.bedCount,
    };
  } catch (error: unknown) {
    if (isUnitNameTakenError(error)) {
      return { status: "taken", name: error.unitName };
    }
    if (isUnitConfigurationError(error)) {
      return { status: "invalid", field: error.field ?? null };
    }
    if (isUnitRefusedError(error)) {
      return { status: "refused" };
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
    return { status: "refused", message: "that unit cannot be blocked" };

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale))
    return { status: "refused", message: "that unit cannot be blocked" };

  const unitId = String(form.get("unitId") ?? "");
  const reason = String(form.get("reason") ?? "").trim();

  try {
    const { accommodation } = getComposition();
    await accommodation.blockUnit(viewer.userId, unitId, reason);
    revalidateRooms(locale);
    return { status: "done" };
  } catch (error: unknown) {
    if (isUnitOccupiedError(error)) {
      return { status: "occupied", message: error.message };
    }
    if (isUnitConfigurationError(error)) {
      return { status: "invalid", message: error.message };
    }
    if (isUnitRefusedError(error)) {
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
    return { status: "refused", message: "that unit cannot be unblocked" };

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale))
    return { status: "refused", message: "that unit cannot be unblocked" };

  const unitId = String(form.get("unitId") ?? "");

  try {
    const { accommodation } = getComposition();
    await accommodation.unblockUnit(viewer.userId, unitId);
    revalidateRooms(locale);
    return { status: "done" };
  } catch (error: unknown) {
    if (isUnitRefusedError(error)) {
      return { status: "refused", message: error.message };
    }
    throw error;
  }
}

export async function setRoomAdmits(
  _previous: RoomAdmitsOutcome,
  form: FormData,
): Promise<RoomAdmitsOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return { status: "refused" };

  const admits = admitsOf(form);
  if (admits === undefined) return { status: "invalid" };

  try {
    const { accommodation } = getComposition();
    await accommodation.setRoomAdmits(
      viewer.userId,
      String(form.get("unitId") ?? ""),
      admits,
    );
    revalidateRooms(locale);
    return { status: "done" };
  } catch (error: unknown) {
    if (isRoomStillHoldsSomeoneError(error)) return { status: "stillHeld" };
    if (isUnitConfigurationError(error)) return { status: "invalid" };
    if (isUnitRefusedError(error)) return { status: "refused" };
    throw error;
  }
}
