import type { OperatingModel } from "@ranza/core";

export type StayType = "guest" | "resident";

/**
 * What a new booking starts as (ADR 0057): a student at a dormitory, a Guest
 * anywhere else. A default only — the desk can still take a summer Guest at a
 * yurt or a Resident at a hotel, and nothing in the database asks which.
 */
export function defaultStayTypeFor(model: OperatingModel): StayType {
  return model === "dormitory" ? "resident" : "guest";
}
