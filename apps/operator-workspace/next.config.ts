import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source rather than a build, so Next
  // compiles them itself.
  transpilePackages: ["@ranza/auth", "@ranza/core", "@ranza/i18n", "@ranza/ui"],
  // Every route is locale-prefixed and every locale opens on Today, so neither
  // the bare origin nor a bare locale has a page of its own. "tr" is
  // defaultLocale in @ranza/i18n; it is repeated rather than imported because
  // this file is loaded before the workspace is compiled.
  async redirects() {
    return [
      { source: "/", destination: "/tr/today", permanent: false },
      {
        source: "/:locale(tr|en|ar)",
        destination: "/:locale/today",
        permanent: false,
      },
    ];
  },
};

export default config;
