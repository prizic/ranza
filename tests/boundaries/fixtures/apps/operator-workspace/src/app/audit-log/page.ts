// Deliberately forbidden: a page reaching a platform module directly rather
// than through src/server/viewer.ts. The two sibling fixtures prove the rule
// fires for packages/db and for a Ranza domain module; this one proves it did
// not stop there when the audit log became the first screen to read a platform
// module — the rule named the Ranza tier alone until then, and a page importing
// @ranza/platform-audit would have passed.
import { recentWithin } from "../../../../../packages/platform/audit/src/index";

export const rows = recentWithin;
