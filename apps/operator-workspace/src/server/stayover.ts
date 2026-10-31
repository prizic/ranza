import "server-only";
import {
  STAYOVER_EVERY_DAYS,
  STAYOVER_WEEKDAYS,
  type StayoverBoard,
  type StayoverCadence,
  type StayoverSettings,
} from "@ranza/housekeeping";
import type { StayoverLimits } from "../features/housekeeping/components/stayover-settings";
import { stayoverDefaultFor } from "../features/housekeeping/stayover";
import { getComposition } from "./composition";
import { operatingModelOf } from "./operating-model";
import { currentViewer } from "./viewer";

/**
 * What a Property cleans on when it has no schedule of its own: its operating
 * model's default (ADR 0057). Asked here, in the host, so the housekeeping
 * module and the database are handed an answer and never learn the model.
 */
async function fallbackFor(propertyId: string): Promise<StayoverCadence> {
  return stayoverDefaultFor(await operatingModelOf(propertyId));
}

export interface StayoverView {
  settings: StayoverSettings;
  /** What applies when the Property has no cadence of its own. */
  fallback: StayoverCadence;
  limits: StayoverLimits;
}

/**
 * The rooms in use that are due a clean today (HK-S4-05). Not `cache`d: a
 * request that marks a room and then reads must see its own press.
 */
export async function stayoverBoardOf(
  propertyId: string,
): Promise<StayoverBoard | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return getComposition().housekeeping.stayoverBoard(
    viewer.userId,
    propertyId,
    await fallbackFor(propertyId),
  );
}

/**
 * The schedule at this Property, and whether the viewer may change it. Null
 * where there is nothing to configure: out of reach, or no housekeeping.
 */
export async function stayoverViewOf(
  propertyId: string,
): Promise<StayoverView | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  const settings = await getComposition().housekeeping.stayoverSettings(
    viewer.userId,
    propertyId,
  );
  if (!settings) return null;
  return {
    settings,
    fallback: await fallbackFor(propertyId),
    limits: { everyDays: STAYOVER_EVERY_DAYS, weekdays: STAYOVER_WEEKDAYS },
  };
}
