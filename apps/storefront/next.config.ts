import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: ["@ranza/i18n", "@ranza/observability", "@ranza/ui"],
};

export default config;
