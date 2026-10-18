import type { HrTransaction } from "./ports";

/**
 * Today for the Organization — the earliest calendar day across its Properties,
 * so a period that has ended has ended everywhere. The database asks the same
 * question of the same function (HR-S1-45), so the module can name the reason
 * and the trigger still holds for a caller that never came through here.
 */
export async function organizationToday(
  tx: HrTransaction,
  organizationId: string,
): Promise<string> {
  const [row] = await tx.$queryRaw<{ today: string }[]>`
    select to_char(app.hr_today(${organizationId}::uuid, null), 'YYYY-MM-DD')
             as today
  `;
  return row?.today ?? new Date().toISOString().slice(0, 10);
}
