# Production security and redaction review

Run for the exact release SHA and staging project.

1. Run `pnpm readiness:security`, dependency review, secret scanning, and Supabase Security/Performance Advisors. Attach sanitized output.
2. Confirm RLS is enabled on every exposed table/view and anonymous/authenticated grants match the authorization matrix. Run all pgTAP tests after a fresh reset.
3. Exercise cross-Operator, cross-Branch, inactive, transferred, unentitled, anonymous, support-context, export-ID, and QR-token denials through real API boundaries.
4. Inspect browser bundles and deployment configuration: service-role, scheduler, encryption, pepper, Turnstile, and rate-limit secrets must be server-only and non-placeholder.
5. Sign out after authenticated use. Confirm the service worker contains only public manifest/icon responses and authenticated HTML/API data is absent from Cache Storage.
6. Inspect sampled structured logs, analytics, error reporting, audit summaries, and export metadata. They must exclude PINs, activation codes, sessions, Wi-Fi values, lead message/contact, and Balance descriptions.
7. Confirm private export objects require authorization, signed links expire, expired objects are removed, and another requester cannot fetch an export ID.
8. Record owner, UTC timestamp, release SHA, advisor run URL, negative-suite URL, findings, remediation issue, and decision.

Use the current Supabase [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod) and [product security index](https://supabase.com/docs/guides/security/product-security) during each review.
