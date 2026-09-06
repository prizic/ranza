import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/:locale/auth/accept",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  transpilePackages: [
    "@ranza/config",
    "@ranza/database",
    "@ranza/domain",
    "@ranza/i18n",
    "@ranza/observability",
    "@ranza/ui",
  ],
};

export default config;
