import type { ApplicationName } from "@ranza/domain";

export interface HealthPayload {
  application: ApplicationName;
  status: "ok";
}

export function createHealthPayload(
  application: ApplicationName,
): HealthPayload {
  return {
    application,
    status: "ok",
  };
}
