# Ranza

Ranza is a multilingual operations platform for independent private student-dormitory Operators in Turkey. It brings Student self-service, Operator workflows, and Prizic platform administration into one configurable multi-tenant product.

The approved pilot delivers Nightly Attendance, next-day Meals, Announcements with explicit acknowledgment, Student Balance records, and configurable Branch Wi-Fi information. Product decisions and boundaries are documented in [the pilot specification](docs/specs/ranza-pilot.md) and [domain context](CONTEXT.md).

Implementation is tracked in GitHub Issues and proceeds as production-ready vertical slices. Attendance and Meals are the first pilot-proof workflows; Overnight Leave Requests, payment processing, Dormitory Accounting, and native mobile applications are intentionally deferred.

## Local development

Use Node.js 22 and pnpm through Corepack:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Run the complete application quality gate with `pnpm check`. After a successful build, `pnpm smoke` starts every production server and verifies its `/health` endpoint.

Local database work requires Docker and the Supabase CLI:

```sh
pnpm db:start
pnpm db:reset
pnpm db:test
pnpm db:stop
```

See [environment configuration](docs/environment.md) before adding a database-backed route. Package responsibilities and dependency direction are defined in [the pilot specification](docs/specs/ranza-pilot.md#91-monorepo) and enforced by the root lint command.
