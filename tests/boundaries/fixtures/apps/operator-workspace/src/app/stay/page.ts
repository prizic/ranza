// Deliberately forbidden: a page reaching a Ranza domain module directly rather
// than through src/server/viewer.ts. The sibling fixture proves the rule fires
// for packages/db; this one proves it did not stop there when the Resident
// access path added two more modules that reach tenant tables.
import { ownStays } from "../../../../../packages/ranza/stays/src/index";

export const rows = ownStays;
