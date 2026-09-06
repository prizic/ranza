import {
  canTransitionOperator,
  operatorStatuses,
  parseBranchDraft,
  parseOperatorDraft,
  type BranchDraft,
  type BranchStatus,
  type OperatorDraft,
  type OperatorStatus,
} from "@ranza/domain";

export type PlatformRole = "platform_admin" | "platform_support";
export type PlatformMembershipStatus = "active" | "suspended" | "archived";

export interface PlatformActor {
  mfaRequired: boolean;
  mfaVerified: boolean;
  role: PlatformRole;
  status: PlatformMembershipStatus;
  userId: string;
}

export interface MutationContext {
  actorUserId: string;
  correlationId: string;
}

export interface OperatorRecord {
  id: string;
  status: OperatorStatus;
}

export interface BranchRecord {
  id: string;
  operatorId: string;
  status: BranchStatus;
}

export interface OperatorControlRepository {
  archiveBranch(
    input: { branchId: string; operatorId: string },
    context: MutationContext,
  ): Promise<BranchRecord | null>;
  createBranch(
    input: BranchDraft & { operatorId: string },
    context: MutationContext,
  ): Promise<BranchRecord>;
  createOperator(
    input: OperatorDraft,
    context: MutationContext,
  ): Promise<OperatorRecord>;
  setOperatorStatus(
    input: {
      currentStatus: OperatorStatus;
      operatorId: string;
      status: OperatorStatus;
    },
    context: MutationContext,
  ): Promise<OperatorRecord | null>;
}

export class OperatorControlError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "INVALID_INPUT"
      | "INVALID_TRANSITION"
      | "MFA_REQUIRED"
      | "TARGET_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "OperatorControlError";
  }
}

function authorize(actor: PlatformActor): MutationContext {
  if (actor.status !== "active" || actor.role !== "platform_admin") {
    throw new OperatorControlError(
      "FORBIDDEN",
      "An active Platform Admin membership is required.",
    );
  }
  if (actor.mfaRequired && !actor.mfaVerified) {
    throw new OperatorControlError(
      "MFA_REQUIRED",
      "A verified multi-factor session is required.",
    );
  }
  return { actorUserId: actor.userId, correlationId: crypto.randomUUID() };
}

function inputError(error: unknown): never {
  if (error instanceof OperatorControlError) throw error;
  throw new OperatorControlError(
    "INVALID_INPUT",
    error instanceof Error ? error.message : "Invalid input.",
  );
}

export function createOperatorControlService(
  repository: OperatorControlRepository,
  correlationId: () => string = () => crypto.randomUUID(),
) {
  function contextFor(actor: PlatformActor): MutationContext {
    return { ...authorize(actor), correlationId: correlationId() };
  }

  return {
    async archiveBranch(
      actor: PlatformActor,
      input: { branchId: string; operatorId: string },
    ) {
      const result = await repository.archiveBranch(input, contextFor(actor));
      if (!result) {
        throw new OperatorControlError(
          "TARGET_NOT_FOUND",
          "The Branch does not belong to the selected Operator.",
        );
      }
      return result;
    },

    async createBranch(
      actor: PlatformActor,
      input: BranchDraft & { operatorId: string },
    ) {
      const context = contextFor(actor);
      let draft: BranchDraft;
      try {
        draft = parseBranchDraft(input);
      } catch (error) {
        return inputError(error);
      }
      return repository.createBranch(
        { ...draft, operatorId: input.operatorId },
        context,
      );
    },

    async createOperator(actor: PlatformActor, input: OperatorDraft) {
      const context = contextFor(actor);
      let draft: OperatorDraft;
      try {
        draft = parseOperatorDraft(input);
      } catch (error) {
        return inputError(error);
      }
      return repository.createOperator(draft, context);
    },

    async setOperatorStatus(
      actor: PlatformActor,
      input: {
        currentStatus: OperatorStatus;
        operatorId: string;
        status: OperatorStatus;
      },
    ) {
      const context = contextFor(actor);
      if (
        !operatorStatuses.includes(input.currentStatus) ||
        !operatorStatuses.includes(input.status)
      ) {
        throw new OperatorControlError(
          "INVALID_INPUT",
          "The Operator status is unsupported.",
        );
      }
      if (!canTransitionOperator(input.currentStatus, input.status)) {
        throw new OperatorControlError(
          "INVALID_TRANSITION",
          "The requested Operator lifecycle transition is not allowed.",
        );
      }
      const result = await repository.setOperatorStatus(input, context);
      if (!result) {
        throw new OperatorControlError(
          "TARGET_NOT_FOUND",
          "The Operator was not found.",
        );
      }
      return result;
    },
  };
}
