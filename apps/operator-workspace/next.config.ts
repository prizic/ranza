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
  // A server action's body is 1 MB by default, and a logo larger than that is
  // refused by the framework with an error nobody can read as a reason. The
  // limit is 512 KB and the module says so (ADR 0046); this lets a file several
  // times that reach it and be told, instead of failing in transit.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Every route is locale-prefixed and every locale opens on Today, so neither
  // the bare origin nor a bare locale has a page of its own. The bare origin is
  // answered by the proxy, which opens it in the language last used, the
  // browser's, or Turkish.
  async redirects() {
    return [
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
