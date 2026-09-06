import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  transpilePackages: ["@ranza/i18n", "@ranza/observability", "@ranza/ui"],
};

export default config;
