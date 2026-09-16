// Deliberately forbidden: a page reaching the database directly instead of
// going through src/server/viewer.ts. Doing this in the real application would
// not throw — it would render an empty page, because the policies would see no
// acting user. scripts/dependency-boundaries.mjs asserts this fails.
import { tenantClient } from "../../../../packages/db/src/index";

export const rows = tenantClient;
