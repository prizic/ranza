export type IntegrationStatus = "connected" | "error" | "not_connected";
export type OperationStatus = "failed" | "retrying" | "resolved";

export interface IntegrationRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly propertyId: string;
  readonly key: string;
  readonly name: string;
  readonly category: string;
  readonly status: IntegrationStatus;
  readonly detail: string | null;
  readonly config: Record<string, unknown>;
  readonly lastSyncAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface FailedOperationRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly propertyId: string;
  readonly integrationId: string | null;
  readonly integrationName: string;
  readonly operation: string;
  readonly error: string;
  readonly status: OperationStatus;
  readonly attempts: number;
  readonly payload: Record<string, unknown>;
  readonly lastAttemptAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ConnectIntegrationInput {
  readonly propertyId: string;
  readonly key: string;
  readonly name: string;
  readonly category: string;
  readonly config?: Record<string, unknown>;
}

export interface RecordFailureInput {
  readonly propertyId: string;
  readonly integrationKey: string;
  readonly integrationName: string;
  readonly operation: string;
  readonly error: string;
  readonly payload?: Record<string, unknown>;
}

export interface RetryOperationInput {
  readonly operationId: string;
  readonly propertyId: string;
}

export interface RetryOperationResult {
  readonly ok: boolean;
  readonly operationId: string;
  readonly integrationName: string;
  readonly error?: string;
}

export const INTEGRATIONS_CAPABILITY = {
  moduleKey: "platform_core",
  capabilityKey: "integrations",
} as const;
