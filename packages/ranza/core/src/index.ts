export { createCoreModule } from "./module";
export type { CoreModule } from "./module";
export type { CoreDeps } from "./ports";
export {
  AUDIT_READ_PERMISSION,
  CONFIGURATION_CAPABILITY,
  CONFIGURATION_MANAGE_PERMISSION,
  ConfigurationClosedDayError,
  ConfigurationCurrencyFixedError,
  ConfigurationInputError,
  ConfigurationRefusedError,
  ConfigurationStaleError,
  PLATFORM_CORE_MODULE,
  TODAY_CAPABILITY,
} from "./contracts";
export type {
  AuditEntry,
  AuditFilters,
  AuditPage,
  BillingNotice,
  BusinessDatePreview,
  CapabilityProperties,
  Denial,
  DenialQuestion,
  ConfigurationField,
  OrganizationNameInput,
  PropertySettings,
  PropertySettingsInput,
  SettingsSaved,
  CapabilityRef,
  EntitledProperty,
  PermissionGate,
  WorkingDay,
} from "./contracts";
export type { AuditLocation, AuditNames } from "./audit-log";
export { MIN_SEARCH_LENGTH, SEARCH_MATCH_LIMIT } from "./audit-log";
