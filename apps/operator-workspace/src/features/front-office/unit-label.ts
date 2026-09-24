/**
 * How a Unit is named at the desk: a bed by its room and its own name, so bed
 * "A" in room 401 reads "401 · A" and not "A" (ADR 0025). A room is its name.
 */
export function unitLabel(roomName: string | null, unitName: string): string {
  return roomName ? `${roomName} · ${unitName}` : unitName;
}
