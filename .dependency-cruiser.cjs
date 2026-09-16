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
  },
};
