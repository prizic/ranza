export {
  createAuditModule,
  recentWithin,
  recordWithin,
} from "./application/audit";
export type { AuditModule } from "./application/audit";
export type { AuditClient, ScopeHistory } from "./infrastructure/repository";
export { AuditEntryError } from "./domain/record";
export type { AuditEntry, AuditRecord } from "./domain/record";
export type { AuditDeps } from "./ports";
