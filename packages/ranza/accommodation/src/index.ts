export { createAccommodationModule } from "./module";
export type { AccommodationModule } from "./module";
export type { AccommodationDeps } from "./ports";
export {
  BEDS_PER_ROOM,
  BLOCK_REASON,
  BUILDING_NAME,
  FLOOR,
  ROOM_NUMBER,
  ROOMS_CAPABILITY,
  UNIT_BATCH,
  UNIT_CAPACITY,
  UnitConfigurationError,
  UnitNameTakenError,
  UnitOccupiedError,
  UnitRefusedError,
} from "./contracts";
export type {
  AccommodationUnitStatus,
  AccommodationUnitType,
  NewUnits,
  UnitCounts,
  UnitEntry,
  UnitMap,
  UnitsAdded,
  UnitState,
} from "./contracts";
