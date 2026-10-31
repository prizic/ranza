"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import {
  AttendanceInputError,
  AttendanceRefusedError,
  LeaveClosedError,
  LeaveOverlapsError,
  type Mark,
} from "@ranza/attendance";
import { getComposition } from "./composition";
import { requireViewer } from "./viewer";

/**
 * The roll call's commands (RANZ-101): an answer, a floor answered at once, a
 * leave given or closed, the curfew.
 *
 * The same funnel as every other write here (ADR 0007): the session is
 * resolved here and the module asks. Whether this viewer may call this
 * Resident, give leave or set the curfew are the database's answers, and a
 * refusal reads the same whichever of them it was.
 */

/**
 * What the screen shows afterwards. `refused` is a stale screen or a missing
 * permission, said alike. `failed` is a fault, recorded, nothing changed.
 */
export type AttendanceOutcome =
  "done" | "refused" | "overlaps" | "invalidNights" | "closed" | "failed";

/**
 * Matched by class and by name: a class imported through a second copy of the
 * module in the server bundle is a different constructor, and a refusal would
 * then read as a fault.
 */
function is<T extends Error>(
  error: unknown,
  type: new (...args: never[]) => T,
): error is T {
  return (
    error instanceof type ||
    (error instanceof Error && error.name === type.name)
  );
}

function outcomeOf(error: unknown, what: string): AttendanceOutcome {
  if (is(error, AttendanceRefusedError)) return "refused";
  if (is(error, LeaveOverlapsError)) return "overlaps";
  if (is(error, LeaveClosedError)) return "closed";
  if (is(error, AttendanceInputError)) return "invalidNights";
  // Not a refusal the module raised: a lost connection, a schema that moved, a
  // defect. Said as a fault, nothing was changed, and never quietly.
  console.error(`${what} failed unexpectedly`, error);
  return "failed";
}

async function signedIn(locale: string) {
  if (!isSupportedLocale(locale)) return null;
  return requireViewer(locale);
}

export async function markAttendance(input: {
  locale: string;
  propertyId: string;
  night: string;
  answers: readonly { stayId: string; mark: Mark }[];
}): Promise<AttendanceOutcome> {
  const viewer = await signedIn(input.locale);
  if (!viewer) return "failed";
  try {
    await getComposition().attendance.record(
      viewer.userId,
      input.propertyId,
      input.night,
      input.answers,
    );
  } catch (error: unknown) {
    revalidatePath(`/${input.locale}/roll-call`);
    return outcomeOf(error, "recording a roll call answer");
  }
  revalidatePath(`/${input.locale}/roll-call`);
  return "done";
}

export async function markFloorPresent(input: {
  locale: string;
  propertyId: string;
  stayIds: readonly string[];
}): Promise<AttendanceOutcome> {
  const viewer = await signedIn(input.locale);
  if (!viewer) return "failed";
  try {
    await getComposition().attendance.markTheRestPresent(
      viewer.userId,
      input.propertyId,
      input.stayIds,
    );
  } catch (error: unknown) {
    revalidatePath(`/${input.locale}/roll-call`);
    return outcomeOf(error, "marking the rest of a floor present");
  }
  revalidatePath(`/${input.locale}/roll-call`);
  return "done";
}

export async function giveLeave(input: {
  locale: string;
  stayId: string;
  fromNight: string;
  toNight: string;
  reason: string;
}): Promise<AttendanceOutcome> {
  const viewer = await signedIn(input.locale);
  if (!viewer) return "failed";
  try {
    await getComposition().attendance.grantLeave(viewer.userId, {
      stayId: input.stayId,
      fromNight: input.fromNight,
      toNight: input.toNight,
      reason: input.reason,
    });
  } catch (error: unknown) {
    return outcomeOf(error, "giving leave");
  }
  revalidatePath(`/${input.locale}/roll-call`);
  return "done";
}

/** Back is an end for a leave that has begun and a cancellation for one that has not. */
export async function closeLeave(input: {
  locale: string;
  leaveId: string;
  how: "back" | "cancel";
}): Promise<AttendanceOutcome> {
  const viewer = await signedIn(input.locale);
  if (!viewer) return "failed";
  const attendance = getComposition().attendance;
  try {
    if (input.how === "back") {
      await attendance.returnFromLeave(viewer.userId, input.leaveId);
    } else {
      await attendance.cancelLeave(viewer.userId, input.leaveId);
    }
  } catch (error: unknown) {
    revalidatePath(`/${input.locale}/roll-call`);
    return outcomeOf(error, "closing a leave");
  }
  revalidatePath(`/${input.locale}/roll-call`);
  return "done";
}

export async function changeCurfew(input: {
  locale: string;
  propertyId: string;
  curfew: string | null;
}): Promise<AttendanceOutcome> {
  const viewer = await signedIn(input.locale);
  if (!viewer) return "failed";
  try {
    await getComposition().attendance.setCurfew(
      viewer.userId,
      input.propertyId,
      input.curfew,
    );
  } catch (error: unknown) {
    return outcomeOf(error, "changing the curfew");
  }
  revalidatePath(`/${input.locale}/roll-call`);
  return "done";
}
