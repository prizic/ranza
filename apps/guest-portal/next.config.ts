import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Next writes its own AGENTS.md and CLAUDE.md into this directory on `next
  // dev`. AGENTS.md is load-bearing here — it is the entry point to this
  // repository's authority chain — and a second one describing Next's
  // conventions would be read as Ranza guidance. Off.
  agentRules: false,
  // Workspace packages ship TypeScript source rather than a build, so Next
  // compiles them itself. @ranza/core is deliberately absent: the Portal has no
  // business asking which Properties a Staff Member may reach (blueprint 4.3).
  transpilePackages: [
    "@ranza/auth",
    "@ranza/i18n",
    "@ranza/stays",
    "@ranza/ui",
  ],
  // Every route is locale-prefixed, and the Portal's only destination is the
  // viewer's own Stay. The locale root is a redirect rather than a page,
  // because a page whose whole body is `redirect()` is one.
  async redirects() {
    return [
      { source: "/", destination: "/tr/stay", permanent: false },
      {
        source: "/:locale(tr|en|ar)",
        destination: "/:locale/stay",
        permanent: false,
      },
    ];
  },
};

// Points next-intl at the request config above rather than its default
// `./i18n/request.ts`, because this application keeps its source under `src/`.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(config);
