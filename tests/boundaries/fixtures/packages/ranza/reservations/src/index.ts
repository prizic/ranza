// Deliberately forbidden: one module reaching into another module's domain
// layer instead of its public contract. scripts/dependency-boundaries.mjs
// asserts this fails.
import { recordShape } from "../../../platform/audit/src/domain/record";

export const borrowed = recordShape;
