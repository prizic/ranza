import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  async headers() {
    return [
      {
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
        source: "/(.*)",
      },
    ];
  },
  transpilePackages: ["@ranza/i18n", "@ranza/observability", "@ranza/ui"],
};

export default config;
