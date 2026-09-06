# Environment configuration

Copy `.env.example` to `.env.local` for local web development and replace the placeholder values with the output from `pnpm db:start`. Environment files are ignored; only `.env.example` is committed.

`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are safe for browser bundles. `SUPABASE_SERVICE_ROLE_KEY` and `SENTRY_DSN` are server-only. A secret must never use the `NEXT_PUBLIC_` prefix, appear in a health response, or be written to logs.

Applications must validate variables through `@ranza/config` at the server or browser boundary that consumes them. The bootstrap applications do not require database credentials to render or answer health checks; later database-backed routes must call the applicable parser before creating a client.
