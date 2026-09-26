/**
 * Cache keys for Today.
 *
 * The same prefix as every other feature's (ADR 0019): the viewer, their
 * Organization and the Property, so a Property switch or a different Staff
 * Member on the same browser is never answered from the last one's figures.
 */

export interface TodayScope {
  userId: string;
  organizationId: string;
  propertyId: string;
}

export const todayKeys = {
  summary: (scope: TodayScope) =>
    [
      "ranza",
      scope.userId,
      scope.organizationId,
      scope.propertyId,
      "today",
      "summary",
    ] as const,
};
