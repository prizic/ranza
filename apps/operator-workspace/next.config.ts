import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const config: NextConfig = {
  // A self-contained server for the container image — see deploy/README.md.
  // `next dev` ignores it; `next start` only warns.
  output: "standalone",
  // Next writes its own AGENTS.md and CLAUDE.md into this directory on `next
  // dev`. AGENTS.md is load-bearing here — it is the entry point to this
  // repository's authority chain — and a second one describing Next's
  // conventions would be read as Ranza guidance. Off.
  agentRules: false,
  // Workspace packages ship TypeScript source rather than a build, so Next
  // compiles them itself.
  transpilePackages: [
    "@ranza/auth",
    "@ranza/core",
    "@ranza/i18n",
    "@ranza/reservations",
    "@ranza/stays",
    "@ranza/ui",
  ],
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

// Points next-intl at the request config above rather than its default
// `./i18n/request.ts`, because this application keeps its source under `src/`.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(config);
