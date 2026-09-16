export interface HealthPayload {
  application: string;
  status: "ok";
}

export function createHealthPayload(application: string): HealthPayload {
  return { application, status: "ok" };
}
