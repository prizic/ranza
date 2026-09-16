/**
 * Enforces docs/RANZA_PRODUCT_BLUEPRINT.md section 9.8 module tiers:
 *
 *   packages/platform/*  host-agnostic reusable modules (finance, inventory, ...)
 *   packages/ranza/*     Ranza domain modules (accommodation, reservations, ...)
 *   packages/adapters/*  thin mappings from Ranza concepts to platform contracts
 *   packages/*           cross-cutting infrastructure (config, i18n, ui, observability)
 *
 * Dependency direction: adapters -> {platform, ranza} -> infrastructure.
 *
 * Import-level rules live here. The blueprint also forbids platform modules from
 * *referencing* Ranza vocabulary (Property, Guest, Stay, Folio, ...), which is an
 * identifier-level rule a dependency graph cannot see; scripts/dependency-boundaries.mjs
 * enforces that half.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular-dependencies",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "packages-must-not-import-applications",
      comment: "Packages are consumed by applications, never the reverse.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "applications-must-not-import-each-other",
      comment: "Each application is separately deployable.",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" },
    },
    {
      name: "platform-must-not-import-ranza",
      comment:
        "Blueprint 9.8: a reusable Platform Module must stay host-agnostic. " +
        "Translation belongs in a host adapter.",
      severity: "error",
      from: { path: "^packages/platform/" },
      to: { path: "^packages/ranza/" },
    },
    {
      name: "platform-must-not-import-adapters",
      comment: "Adapters sit above platform modules, never below them.",
      severity: "error",
      from: { path: "^packages/platform/" },
      to: { path: "^packages/adapters/" },
    },
    {
      name: "ranza-must-not-import-adapters",
      comment: "Adapters depend on domain modules, not the reverse.",
      severity: "error",
      from: { path: "^packages/ranza/" },
      to: { path: "^packages/adapters/" },
    },
    {
      name: "tenant-data-only-through-the-server-funnel",
      comment:
        "ADR 0007: a tenant read must publish the acting user before it runs. " +
        "Skipping that does not raise — policies see a null user and deny, so " +
        "the page renders empty and looks like missing data. The three steps " +
        "live together in src/server/viewer.ts, and nothing else may reach the " +
        "database or a module that does.",
      severity: "error",
      from: {
        path: "^apps/[^/]+/src/",
        pathNot: "^apps/[^/]+/src/server/",
      },
      to: { path: "^packages/(auth|db|ranza/core)/" },
    },
    {
      name: "modules-expose-only-their-public-contract",
      comment:
        "Blueprint 9.10: importers may reach a module's index only, never its " +
        "domain, application, or infrastructure internals.",
      severity: "error",
      from: { pathNot: "^packages/(platform|ranza|adapters)/([^/]+)/" },
      to: {
        path: "^packages/(platform|ranza|adapters)/([^/]+)/src/(domain|application|infrastructure)/",
      },
    },
    {
      name: "modules-do-not-reach-into-each-other",
      comment:
        "Blueprint 9.10: the public-contract rule above only stops importers " +
        "outside the tiers. A module is not an outsider, so without this one " +
        "module could reach straight into another's internals — which is the " +
        "coupling the contract exists to prevent.",
      severity: "error",
      from: { path: "^packages/(platform|ranza|adapters)/([^/]+)/" },
      to: {
        path: "^packages/(platform|ranza|adapters)/([^/]+)/src/(domain|application|infrastructure)/",
        pathNot: "^packages/$1/$2/",
      },
    },
    {
      name: "domain-layer-is-framework-independent",
      comment:
        "Blueprint 9.10: domain rules must not depend on Next, Supabase, or Prisma.",
      severity: "error",
      from: { path: "^packages/(platform|ranza)/[^/]+/src/domain/" },
      to: {
        path: "(^|node_modules/)(next(?:/|$)|@prisma/|prisma(?:/|$))",
      },
    },
    {
      name: "infrastructure-packages-must-not-import-modules",
      comment:
        "config, db, i18n, ui and observability are cross-cutting and sit below every module.",
      severity: "error",
      from: { path: "^packages/(config|db|i18n|ui|observability)/" },
      to: { path: "^packages/(platform|ranza|adapters)/" },
    },
    {
      name: "ui-must-not-reach-server-code",
      comment:
        "Shared UI primitives stay renderable without server dependencies.",
      severity: "error",
      from: { path: "^packages/ui/" },
      to: {
        path: "^packages/(config|db|observability)/|(^|node_modules/)(@prisma/|prisma(?:/|$))",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: "(^|/)(.next|dist)/",
    tsConfig: { fileName: "tsconfig.json" },
    // Workspace packages export TypeScript source through an "exports" field.
    // Without these the resolver gives up on "@ranza/db" and reports it as an
    // unresolvable name, which every path-based rule above would then miss —
    // the rules would pass while enforcing nothing.
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"],
    },
  },
};
