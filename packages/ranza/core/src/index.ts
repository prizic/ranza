export { createCoreModule } from "./module";
export type { CoreModule } from "./module";
export type { CoreDeps } from "./ports";
export {
  AUDIT_READ_PERMISSION,
  PLATFORM_CORE_MODULE,
  TODAY_CAPABILITY,
} from "./contracts";
export type {
  AuditEntry,
  AuditFilters,
  AuditPage,
  CapabilityRef,
  EntitledProperty,
} from "./contracts";
export type { AuditLocation, AuditNames } from "./audit-log";
export { MIN_SEARCH_LENGTH } from "./audit-log";
