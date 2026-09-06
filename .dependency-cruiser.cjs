/** @type {import('dependency-cruiser').IConfiguration} */
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
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    ...["storefront", "product-web", "control-plane"].map((application) => ({
      name: `${application}-must-not-import-other-applications`,
      severity: "error",
      from: { path: `^apps/${application}/` },
      to: { path: `^apps/(?!${application}/)` },
    })),
    {
      name: "domain-is-framework-independent",
      severity: "error",
      from: { path: "^packages/domain/" },
      to: { path: "(^|node_modules/)(next(?:/|$)|@supabase/)" },
    },
    {
      name: "domain-is-the-base-layer",
      severity: "error",
      from: { path: "^packages/domain/" },
      to: { path: "^packages/(?!domain/)" },
    },
    {
      name: "config-dependencies-flow-inward",
      severity: "error",
      from: { path: "^packages/config/" },
      to: { path: "^packages/(database|auth|ui|i18n|observability)/" },
    },
    {
      name: "i18n-dependencies-flow-inward",
      severity: "error",
      from: { path: "^packages/i18n/" },
      to: { path: "^packages/(database|auth|ui|observability)/" },
    },
    {
      name: "database-dependencies-flow-inward",
      severity: "error",
      from: { path: "^packages/database/" },
      to: { path: "^packages/(auth|ui|i18n|observability)/" },
    },
    {
      name: "auth-dependencies-flow-inward",
      severity: "error",
      from: { path: "^packages/auth/" },
      to: { path: "^packages/(ui|i18n|observability)/" },
    },
    {
      name: "ui-cannot-access-server-packages",
      severity: "error",
      from: { path: "^packages/ui/" },
      to: { path: "^packages/(database|auth|observability)/" },
    },
    {
      name: "observability-dependencies-flow-inward",
      severity: "error",
      from: { path: "^packages/observability/" },
      to: { path: "^packages/(database|auth|ui|i18n)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: "(^|/)(.next|dist)/",
    tsConfig: { fileName: "tsconfig.json" },
  },
};
