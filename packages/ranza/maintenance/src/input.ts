import { MaintenanceInputError } from "./contracts";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A calendar day as `YYYY-MM-DD`. Round-tripped rather than parsed, because
 * `Date` accepts the 31st of February as the 3rd of March, and Postgres would
 * then refuse what this let through.
 */
export function boundedDate(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const day = isoDate.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (
    !day ||
    Number.isNaN(day.getTime()) ||
    day.toISOString().slice(0, 10) !== value
  ) {
    throw new MaintenanceInputError("a date is written YYYY-MM-DD");
  }
  return value;
}
