export { createAuditModule, recordWithin } from "./application/audit";
export type { AuditModule } from "./application/audit";
export type { AuditClient } from "./infrastructure/repository";
export { AuditEntryError } from "./domain/record";
export type { AuditEntry, AuditRecord } from "./domain/record";
export type { AuditDeps } from "./ports";
