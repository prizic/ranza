# Storefront lead intake

Configure the Storefront environment in `.env.example`, using its exact public origin and a Cloudflare Turnstile site registered to that hostname. Generate `LEAD_RATE_SECRET` as a random server secret. The endpoint validates Turnstile hostname and `demo` action. An unconfigured service returns 503 and never claims receipt.

The default rate bucket is global (10 attempts/hour). For deployment, configure `LEAD_TRUSTED_IP_HEADER` only when the ingress overwrites that header and direct origin traffic is blocked. Never trust an arbitrary forwarded header. The database stores an HMAC of that network signal, never its raw value; buckets expire after a day during intake. Limit request size and time at ingress as well.

The form holds a UUID for unchanged retries. Server receipt checks allow a retry after successful storage without reusing an already consumed CAPTCHA. A changed payload with the same UUID returns 409. Success includes only a new correlation reference; persisted lead data is never returned publicly.

`/[locale]/leads` in the Control Plane uses Supabase SSR cookies and authenticated queries. RLS requires MFA (`aal2`), a current `auth.sessions` row, and `private.platform_memberships(user_id, role, status)` with an active `platform_admin` or `support` role. This is the core identity contract shared with Task 03. The membership table can be installed before or after the leads migration: absent membership denies access. Users cannot update anything except processing status; status changes append an actor/time event without contact details.

The localized privacy notice is operational copy. Before production collection, Prizic must approve its controller/contact details, lawful basis, retention policy and processor disclosures under the specification's policy gate. Bump the consent version in domain copy and submission migration for material notice changes. No guessed retention period is implemented.

Verify with `pnpm test:unit tests/unit/leads.test.ts`, `pnpm test:e2e tests/e2e/leads.spec.ts`, and `pnpm db:test`. Live Turnstile and authorized staff browser verification additionally require configured services and an MFA-enabled platform account. The local browser test intentionally verifies the unconfigured failure path.
