// Deliberately forbidden: a reusable platform module reaching into a Ranza
// domain module. scripts/dependency-boundaries.mjs asserts this fails.
import { accommodationUnitKind } from "../../../ranza/accommodation/src/index";

export const postingUnit = accommodationUnitKind;
