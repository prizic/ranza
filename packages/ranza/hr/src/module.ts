import { createEmployees } from "./employees";
import { createLeave } from "./leave";
import { createPayroll } from "./payroll";
import type { HrDeps } from "./ports";
import { createShifts } from "./shifts";
import { createWorkplace } from "./workplace";

/**
 * Human resources and payroll (blueprint 5.11).
 *
 * Every command runs inside the acting user's request context (ADR 0007), so
 * the row-level policies decide what lands (ADR 0012) and nothing here asks a
 * permission of its own except to name a refusal's reason.
 */
export function createHrModule(deps: HrDeps) {
  return {
    ...createEmployees(deps),
    ...createShifts(deps),
    ...createLeave(deps),
    ...createPayroll(deps),
    ...createWorkplace(deps),
  };
}

export type HrModule = ReturnType<typeof createHrModule>;
