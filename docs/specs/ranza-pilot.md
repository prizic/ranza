# Ranza Pilot Technical Specification

Status: Approved for implementation and ticket decomposition  
Date: 2026-09-06  
Owner: Prizic  
Target: One full-time developer, six-week pilot build, followed by measured vertical releases

## 1. Source of Truth

This specification implements the approved product decisions in:

- `CONTEXT.md`
- `docs/adr/0001-shared-vertical-saas.md`
- `docs/adr/0002-operator-account-with-multiple-branches.md`
- `docs/adr/0003-pilot-product-surfaces.md`
- `docs/adr/0004-pilot-rollout-and-validation.md`
- `docs/adr/0005-entitlements-and-branch-configuration.md`
- `docs/adr/0006-monorepo-application-boundaries.md`
- `docs/adr/0007-shared-supabase-with-rls.md`
- `docs/adr/0008-operator-issued-student-credentials.md`
- `docs/adr/0009-operator-data-lifecycle.md`
- `docs/product-parking-lot.md`

If implementation details conflict with those documents, the ADRs and domain language win unless a later ADR explicitly supersedes them. This document makes protocol and schema decisions needed to turn those approved product choices into buildable work.

## 2. Problem

Independent private student-dormitory Operators in Turkey coordinate recurring operational work through paper, spreadsheets, and chat. These tools do not provide one trustworthy Branch-scoped record of who is staying tonight, how many meals to prepare, which Students acknowledged an Announcement, what a Student owes, or how shared Branch information should be exposed. Multi-Branch Operators must also repeat work across separate systems and cannot safely limit staff to their assigned Branches.

Students need a low-friction, mobile-first experience that works without an email account or delivered phone OTP. Operators need a reliable daily operational record. Prizic needs one maintainable product that can serve different Operators through Entitlements and supported configuration instead of customer-specific forks.

## 3. Solution

Build Ranza as one Turkish-first, multilingual, multi-tenant SaaS in a pnpm/Turborepo monorepo. It has three separately deployable web applications:

1. Storefront: a localized one-page marketing and contact/demo site.
2. Product Web: one mobile-first application containing the Student App and Operator Dashboard.
3. Prizic Control Plane: an internal application for Operator lifecycle, Entitlements, supported modes, service health, and audited support actions.

Development, staging, and production each use one shared Supabase backend with PostgreSQL row-level security. The first pilot delivers Nightly Attendance, next-day Meal Selections, Announcements with explicit acknowledgment, Student Balance records without moving money, and configurable Wi-Fi Access Information. The suite is released as production-ready vertical slices, beginning with Attendance and Meals.

## 4. Goals and Success Measures

### 4.1 Product goals

- Replace the pilot Operator's primary nightly-attendance and next-day meal-count processes.
- Give Students one simple, installable web experience in Turkish, English, or Arabic.
- Support one Operator with any number of Branches, including separate male and female residences, under one Subscription and consolidated invoice.
- Enforce Operator and Branch boundaries at the database as well as application layers.
- Give Prizic controlled, audited ways to configure and support every Operator without source-code forks.
- Establish an architecture that can add paid modules and native clients after the pilot without rebuilding the tenant or identity model.

### 4.2 Formal pilot success

The formal evaluation starts only after Attendance and Meals are stable in production. It succeeds when all of these conditions hold for 14 consecutive days:

- At least 85% of active Students submit Nightly Attendance before their Branch cutoff.
- Management uses Ranza as its primary nightly operational record.
- The kitchen relies on Ranza's final Meal counts.
- No critical data error is unresolved.
- The pilot Operator agrees to continue on a paid Subscription.

The Founding Offer price and success-triggered billing start are agreed in writing before the formal evaluation. The public Storefront continues to say “contact us” until three Operators are paying.

## 5. Scope and Delivery Order

### 5.1 Pilot product scope

- Operator, Branch, room, bed, staff, and Student roster administration.
- Operator-issued Student activation code, Student Access ID, and PIN authentication.
- Nightly Attendance with Branch-local cutoff, snapshot, corrections, and export.
- Next-day Meal Offerings, explicit Student response, final kitchen count, corrections, and export.
- Branch- or Operator-targeted Announcements, translations, revisions, explicit acknowledgment, and follow-up list.
- Append-only Student Balance entries for charges, recorded payments, credits, adjustments, and reversals.
- Branch Wi-Fi Access Information in either Protected or Public/QR mode.
- Core Entitlements and supported Operator/Branch configuration.
- Turkish, English, and Arabic static UI; Arabic right-to-left layout.
- Installable Product Web PWA.
- One-page Storefront with contact/demo lead capture.
- Minimal Prizic Control Plane.
- Operator-scoped data exports, audit trail, monitoring, and documented lifecycle controls.

### 5.2 Vertical release order

1. Foundation: tenancy, roles, roster, Student activation, localization, configuration, audit, and deployment.
2. Nightly Attendance.
3. Next-day Meals.
4. Announcements and acknowledgments.
5. Student Balance.
6. Wi-Fi access modes, Storefront completion, and Control Plane operational completion.

Each slice must be production deployable, observable, and usable by testers before the next workflow becomes the delivery focus. Feature flags may hide incomplete later slices, but no pilot Operator receives a partially working workflow.

## 6. Actors and Authorization Roles

| Actor | Scope | Core permissions |
|---|---|---|
| Visitor | Public | View Storefront, submit lead, view a valid Public/QR Wi-Fi page |
| Student | Own active Branch and own records | Activate account, use Student App, submit own responses, view own Balance, acknowledge targeted Announcements, view allowed Wi-Fi information |
| Branch Staff | Assigned Branches | View operational data and perform explicitly granted Branch tasks; no unassigned Branch access |
| Manager | Assigned Branches or all Operator Branches when authorized | Manage roster and workflows within authorized Branches |
| Operator Owner | Entire Operator | Manage all Branches, staff assignments, safe settings, and exports; view Subscription summary |
| Prizic Support | Explicit, time-bounded support context | Inspect and override supported settings only through audited support actions |
| Prizic Platform Admin | Platform-wide | Create/suspend Operators, manage Entitlements and supported modes, inspect service health, and perform audited administrative actions |

Authorization is additive only within one Operator. No Operator role grants access to another Operator. A Student has exactly one active home Branch at a time. Transfer preserves prior records and changes future access; it never rewrites historical Branch ownership.

## 7. User Stories

### 7.1 Storefront and commercial intake

1. As a Visitor, I want to understand Ranza's operational outcomes in my chosen supported language, so that I can decide whether it fits my dormitory.
2. As a Visitor, I want to request contact or a demonstration without creating an account, so that I can speak with Prizic before buying.
3. As a Visitor, I want clear confirmation after submitting a valid request, so that I know it was received.
4. As a Visitor, I want invalid fields explained without losing my entered information, so that I can correct the request.
5. As Prizic Support, I want abusive or automated lead submissions constrained, so that genuine requests remain usable.
6. As a prospective Operator, I want the Storefront to invite contact rather than promise a public price or self-service purchase, so that the commercial offer matches the founding-sales process.

### 7.2 Operator and Branch administration

7. As a Prizic Platform Admin, I want to create, activate, suspend, and archive an Operator, so that Prizic controls customer lifecycle.
8. As a Prizic Platform Admin, I want to create and archive Branches under an Operator, so that one customer can manage multiple residences.
9. As an Operator Owner, I want to view all my Branches in one account, so that I can manage separate buildings without separate subscriptions.
10. As an authorized Manager, I want to switch between my Branches while always seeing the active Branch context, so that I do not update the wrong residence.
11. As an Operator Owner, I want to assign staff to selected Branches or authorize a Manager across all Branches, so that access follows responsibility.
12. As Branch Staff, I want unassigned Branches to be unavailable even through copied URLs or API requests, so that private operational data remains isolated.
13. As an Operator Owner, I want to manage rooms and available beds in each active Branch, so that capacity and Billable Bed totals are traceable.
14. As an Operator Owner, I want one Subscription and consolidated invoice reference with a Branch Billable Bed breakdown, so that multi-Branch pricing is understandable without separate subscriptions or invoices.
15. As an Operator Owner, I want archived Branches excluded from new operations while their historical records remain available under policy, so that closure does not corrupt history.

### 7.3 Student roster, activation, and access

16. As authorized staff, I want to create a Student roster record before activation, so that the correct person is linked to the correct Branch.
17. As authorized staff, I want to import Students from a validated CSV and receive row-level errors, so that initial onboarding does not require repetitive entry or silently accept bad data.
18. As authorized staff, I want to issue a high-entropy, expiring, one-time Activation Code and a non-secret Student Access ID, so that a Student can activate without email or phone delivery.
19. As a Student, I want to exchange my valid Activation Code for a PIN, so that I can use Ranza with credentials issued by my dormitory.
20. As a Student, I want an invalid, expired, already-used, or mismatched Activation Code rejected without revealing another Student's identity, so that roster data remains private.
21. As a Student, I want repeated failed activation or PIN attempts rate-limited, so that my account is harder to attack.
22. As a Student, I want to sign in later with my Student Access ID and PIN, so that I can use a new browser or device.
23. As a Student, I want my session to expire safely and be revocable, so that a lost shared device does not retain indefinite access.
24. As authorized staff, I want to reset a Student's PIN through an audited recovery flow, so that access can be restored without creating a second identity.
25. As authorized staff, I want to transfer a Student to another Branch in the same Operator, so that future access changes while prior operational records keep their original Branch.
26. As authorized staff, I want to mark a Student inactive, so that a departed Student cannot authenticate or submit new responses.
27. As a Student, I want the interface in Turkish, English, or Arabic, so that I can use the product in a comfortable supported language.

### 7.4 Nightly Attendance

28. As a Manager, I want to configure a Branch timezone and nightly cutoff, so that the operational day follows local practice.
29. As an active Student, I want to declare Staying or Away for tonight, so that staff know my intended overnight status.
30. As an active Student, I want to change my declaration until cutoff, so that I can correct a change of plan.
31. As an active Student, I want a clear confirmation of my latest saved state and cutoff time, so that I know what staff will see.
32. As an active Student, I want a failed or late submission explained without showing a false success, so that I do not assume the record changed.
33. As authorized Branch staff, I want to see Staying, Away, Unconfirmed, response percentage, and last-update status for the active night, so that I can follow up before cutoff.
34. As authorized Branch staff, I want Students with no submitted declaration to remain Unconfirmed, so that missing responses are never treated as Staying or Away.
35. As authorized Branch staff, I want an idempotent final Attendance Snapshot at cutoff, so that repeated jobs cannot produce conflicting nightly totals.
36. As authorized Branch staff, I want to correct or reopen a finalized Student state only after giving a reason, so that exceptional changes remain accountable.
37. As authorized Branch staff, I want to export the final Student-level snapshot and totals, so that the dormitory has a portable operational record.
38. As an Operator Owner, I want historical Attendance preserved against the Branch where it occurred after a Student transfer, so that past reports stay accurate.
39. As Prizic Support, I want failed or delayed cutoff jobs visible and safely retryable, so that a scheduler incident does not silently lose a night's record.

### 7.5 Next-day Meals

40. As a Manager, I want to publish the breakfast, lunch, and/or dinner opportunities offered by a Branch for a service date, so that Students can respond only to available meals.
41. As a Manager, I want each service date governed by a Branch-local response deadline, so that the kitchen receives a stable count.
42. As an active Student, I want to explicitly submit which offered meals I will take, including an explicit zero-meal response, so that no meal is inferred from silence.
43. As an active Student, I want to update my submitted Meal Selection until the deadline, so that changed plans are reflected.
44. As an active Student, I want a clear confirmation of my latest saved Meal Selection and deadline, so that I can verify my response.
45. As authorized Branch staff, I want to distinguish submitted zero-meal responses from Students who did not respond, so that follow-up and kitchen counts are accurate.
46. As kitchen staff with Branch access, I want final counts by offered meal after the deadline, so that I can prepare the right quantities.
47. As authorized Branch staff, I want finalization to be idempotent, so that retries do not change the count.
48. As authorized Branch staff, I want to correct a finalized selection only after giving a reason, so that late exceptions remain traceable.
49. As authorized Branch staff, I want to export final Meal totals and Student-level selections, so that the kitchen and management have a portable record.
50. As Prizic Support, I want failed or delayed Meal finalization jobs visible and safely retryable, so that a scheduler incident does not leave the kitchen without a reliable count.

### 7.6 Announcements and acknowledgment

51. As authorized staff, I want to draft an Announcement before publication, so that unfinished content is not visible to Students.
52. As authorized staff, I want to target an Announcement to the whole Operator or selected Branches, so that the intended Students receive it.
53. As authorized staff, I want to provide source content and optional Turkish, English, and Arabic translations, so that important messages can be understood without unreviewed machine translation.
54. As a Student, I want a clearly labeled fallback language when my preferred translation is unavailable, so that missing translation is visible rather than misleading.
55. As a targeted active Student, I want to view current Announcements and explicitly acknowledge each required item, so that staff can distinguish acknowledgment from a page view.
56. As a Student, I want untargeted or another Operator's Announcements denied even through copied URLs, so that communications remain private.
57. As authorized staff, I want to see acknowledged, unacknowledged, and inactive-recipient counts, so that I can follow up responsibly.
58. As authorized staff, I want material edits after publication to create a new revision and reset acknowledgments for active recipients, so that old acknowledgments do not apply to changed content.
59. As authorized staff, I want publication, revision, archive, and acknowledgment timestamps retained, so that the communication history is auditable.

### 7.7 Student Balance

60. As authorized finance staff, I want to record a charge with amount, currency, due date, description, and effective date, so that the Student's obligation is represented.
61. As authorized finance staff, I want to record an externally received partial or full payment, so that the remaining Balance reflects money received outside Ranza.
62. As authorized finance staff, I want to record credits and adjustments, so that approved non-payment changes are represented.
63. As authorized finance staff, I want mistakes corrected through linked reversal entries instead of editing or deleting history, so that the ledger remains auditable.
64. As a Student, I want to see only my charges, recorded payments, credits, due dates, and remaining Balance, so that I understand what the dormitory records without seeing another Student's finances.
65. As authorized finance staff, I want to see a Branch list of remaining Student Balances and overdue amounts, so that I can follow up.
66. As authorized finance staff, I want concurrent or repeated submissions protected from duplicate entries, so that retries do not change money records twice.
67. As an Operator Owner, I want Balance records exported with their immutable entry history, so that the Operator retains a portable record.
68. As a Student, I want the interface to state that Ranza records but does not collect or transfer money, so that a recorded payment is not mistaken for a Ranza payment receipt.

### 7.8 Wi-Fi Access Information and configurable visibility

69. As an Operator Owner, I want to choose an allowed Protected or Public/QR Wi-Fi mode per Branch, so that visibility matches local practice.
70. As an active Student or assigned staff member, I want to view current Protected Wi-Fi details for my Branch after signing in, so that credentials are not shared with unrelated users.
71. As a Visitor with a current Branch QR/link, I want to view Public/QR Wi-Fi details without signing in, so that the Branch can offer convenient access.
72. As a Visitor without a valid, active Public/QR token, I want access denied without exposing Branch credentials, so that old or guessed links do not work.
73. As an Operator Owner, I want to rotate or revoke a Public/QR link independently of changing the Wi-Fi password, so that accidental sharing can be contained.
74. As authorized staff, I want Wi-Fi detail and visibility-mode changes audited without placing the password in the audit log, so that accountability does not create another secret copy.
75. As an active Student, I want Protected Wi-Fi access removed when I transfer or become inactive, so that membership changes apply immediately.
76. As an Operator Owner, I want unavailable or unentitled modes impossible to select, so that local configuration remains inside Prizic-supported boundaries.

### 7.9 Entitlements, configuration, and support

77. As a Prizic Platform Admin, I want to grant, revoke, schedule, and inspect Operator Entitlements, so that paid capabilities are centrally controlled.
78. As a Prizic Platform Admin, I want to define which safe modes and value ranges an Operator may configure, so that customer flexibility does not become arbitrary customization.
79. As an Operator Owner, I want to configure entitled features at the allowed Operator or Branch scope, so that Ranza fits each residence without a fork.
80. As an Operator Owner, I want an explanation when a capability is unavailable or locked, so that the difference between configuration and Subscription entitlement is clear.
81. As Prizic Support, I want to enter an explicit support context with a reason and expiry, so that elevated access is time-bounded and attributable.
82. As Prizic Support, I want every support override to record actor, target, previous value, new value, reason, and time, so that changes are reviewable.
83. As an Operator Owner, I want normal safe settings to remain under my control, so that routine operation does not require Prizic intervention.

### 7.10 Control Plane, audit, export, and lifecycle

84. As a Prizic Platform Admin, I want service health and failed background operations summarized without exposing secrets, so that pilot incidents can be detected.
85. As a Prizic Platform Admin, I want audit events searchable by Operator, Branch, actor, action, target, and time, so that support investigations are efficient.
86. As an Operator Owner, I want to export my roster, configuration, Attendance, Meals, Announcements, acknowledgments, Balance entries, and audit records in documented formats, so that my Operator Data is portable.
87. As an Operator Owner, I want an export to contain only my Operator Data even if a request is manipulated, so that tenant isolation survives the export path.
88. As a Prizic Platform Admin, I want to suspend an Operator without deleting history, so that access can stop while contractual or support issues are resolved.
89. As a departed Student, I want my personal data archived, retained, deleted, or anonymized according to the documented policy and legal basis, so that data is not kept indefinitely.
90. As a Prizic Platform Admin, I want destructive lifecycle jobs previewed and logged before execution, so that a broad deletion cannot happen silently.
91. As an Operator Owner, I want an active-Branch Billable Bed total and Branch breakdown, so that the primary pricing quantity is verifiable.

### 7.11 PWA, accessibility, and resilience

92. As a Student, I want to install Product Web on a supported phone home screen, so that it feels convenient without a native app.
93. As a Student on a small screen, I want the daily Attendance, Meals, Announcements, Balance, and Wi-Fi tasks reachable without desktop-only interaction, so that mobile use is practical.
94. As a keyboard or assistive-technology user, I want controls, status messages, errors, and focus behavior to be accessible, so that I can complete the same workflows.
95. As an Arabic user, I want layout direction and mixed numeric content handled correctly, so that the interface is readable.
96. As a user with an interrupted connection, I want pending and failed mutations shown honestly and safe retries supported, so that I never mistake an unsaved action for success.
97. As a user, I want maintenance and unexpected errors shown with a recoverable next step and a support reference, so that failures do not appear as blank screens.

## 8. Functional Requirements

### 8.1 Tenant hierarchy and roster

- One Operator owns zero or more Branches and exactly one current Subscription record.
- An active Branch has a name, status, gender/residence classification, IANA timezone, locale defaults, rooms, and beds.
- Branch residence classification is metadata, not an authorization shortcut. Access always follows explicit role or assignment.
- A Billable Bed is an available, non-archived bed in an active Branch, occupied or vacant.
- Commercial records are Operator-scoped. Each billing period stores one consolidated external invoice reference and an immutable Billable Bed snapshot with a Branch breakdown. Legal invoice issuance and payment happen outside Ranza during the pilot.
- Each Student roster record belongs to one Operator and has at most one active Branch assignment.
- Transfer closes the current assignment and creates another in one transaction. It cannot cross Operators; a cross-Operator move requires a distinct identity/onboarding decision outside the pilot.
- Staff access uses Operator membership plus optional Branch assignments. Operator Owner and explicitly operator-wide Manager roles can access all current Branches.
- CSV import is a preview-then-commit workflow. It validates required fields, duplicate external references, Branch ownership, and locale. Valid rows are not committed until the entire chosen batch is confirmed.
- Archiving a Student or Branch prevents new operational records and authentication but does not mutate history.

### 8.2 Authentication protocol

- Staff authenticate through Supabase Auth using verified email magic link or passwordless email OTP. Prizic Platform Admin and Support accounts require MFA before production.
- Each Student receives two values: a stable, non-secret Student Access ID and a high-entropy, expiring, one-time Activation Code.
- Activation Code values are generated with a cryptographically secure source, shown only when issued/reissued, stored only as a versioned slow hash, expire within a configured short window, and are consumed atomically.
- On successful activation, a server-only Student Credential Gateway creates or links exactly one Supabase Auth user and allows the Student to choose a PIN.
- The gateway maps Student Access ID to a server-managed, non-routable Auth identifier. The mapping and any server pepper remain in a non-exposed schema; the Supabase service-role key is never delivered to a browser.
- The PIN is transformed only on the server into a high-entropy Auth password using a versioned keyed derivation before Supabase Auth storage. Logs, analytics, audit records, client storage, and database tables never contain the PIN or derived password.
- Subsequent login exchanges Student Access ID and PIN through the rate-limited gateway for a normal Supabase session. Product data access then uses the session's `auth.uid()` and RLS; the gateway does not mint an independent authorization cookie.
- PIN attempts and activation attempts are rate-limited by credential and network signals without revealing whether a Student Access ID exists. Repeated failure triggers a temporary lock and an audited staff-assisted reset.
- Reset invalidates active sessions, preserves the Student/Auth identity, and requires a new one-time code. Transfer never changes the identity.
- Student deactivation or Operator suspension revokes sessions and prevents a new session.
- Staff and Prizic authorization comes from database membership/assignment records or non-user-editable Auth claims. User-editable metadata is never trusted for authorization.

### 8.3 Nightly Attendance

- The system materializes one Attendance Session per active Branch and local calendar date.
- An open Session has an absolute UTC cutoff derived from the Branch timezone; changing Branch settings does not retroactively change an existing Session.
- A Student response is unique per Session and Student and contains Staying or Away. Absence of a response is presented and counted as Unconfirmed.
- The Student may upsert their own response until the Session cutoff. Server/database time decides whether it is late.
- Cutoff finalization locks the Session and creates one immutable versioned Snapshot containing the eligible Student roster and totals at cutoff.
- Finalization is idempotent under a deterministic Session key and safe to retry.
- An authorized correction after cutoff records before/after values, actor, reason, and timestamp. A reopen is a privileged, audited state change; it never deletes the earlier Snapshot.
- Away is a declaration only. The UI must not call it permission, approval, or leave authorization.

### 8.4 Next-day Meals

- A Meal Day belongs to a Branch and service date and has one immutable UTC deadline derived from the Branch timezone when published.
- An offering is one of breakfast, lunch, or dinner and is unique per Meal Day and type. The pilot has no free-form menu ordering, quantities above one, dietary workflow, or pricing.
- A Student response records a submitted-at time even when zero offerings are selected. Silence remains Unconfirmed and contributes zero to the kitchen count.
- Students may replace their own complete selection until the deadline. The update is atomic across offered meals.
- Finalization locks the eligible roster and per-offering totals in an immutable Snapshot and is idempotent.
- Corrections after deadline append before/after detail, actor, reason, and timestamp without rewriting the original cutoff Snapshot.

### 8.5 Announcements

- Announcement lifecycle is Draft, Published, or Archived.
- Target scope is either the entire Operator or one or more Branches belonging to that Operator.
- Every published Announcement has a numbered revision. A revision stores one source locale, source content, and zero or more human-provided translations.
- Student display chooses the preferred available translation, then the Operator default, then source content. Any fallback is labeled with the displayed language.
- Publication resolves the eligible active Student recipient set. Acknowledgment is unique per revision and Student.
- A material content or target change creates a new revision and a new recipient set; acknowledgments never carry forward automatically.
- Opening, scrolling, or receiving an Announcement never counts as acknowledgment.

### 8.6 Student Balance

- Each Student has one Balance Account per Operator and currency. The pilot defaults new accounts to TRY but stores ISO 4217 currency explicitly.
- Monetary values use fixed-precision numeric data, never floating point.
- Balance Entries are append-only and typed as Charge, External Payment Record, Credit, Adjustment, or Reversal.
- Every entry has an effective date, amount, currency, description, creator, created timestamp, and idempotency key. Charges may have a due date.
- A reversal references one prior unreversed entry and offsets it. Posted entries cannot be edited or deleted in normal application paths.
- Remaining Balance is derived from signed entries using one documented sign convention and may be cached only with transactional reconciliation.
- Ranza does not collect funds, integrate a payment processor, settle, refund, generate fiscal receipts, or claim that a record proves funds cleared.

### 8.7 Wi-Fi Access Information

- Each Branch may have current Wi-Fi data containing network name, secret/password, instructions, and updated time.
- Wi-Fi secrets are encrypted at the application boundary with a versioned server-side key-management scheme before database storage. Keys are outside the database and never sent to unauthorized clients.
- Protected mode permits only active Students of the Branch and currently assigned/authorized staff.
- Public/QR mode uses a high-entropy, revocable public token. Anonymous access resolves only through a server endpoint that validates the token and mode; exposed tables do not receive an anonymous read policy.
- Rotation creates a new public token and invalidates the old token. Link revocation does not require changing the actual Wi-Fi password.
- Audit events identify that Wi-Fi data changed but redact the old and new secrets.

### 8.8 Entitlements and feature configuration

- Prizic owns the Feature Catalog and the list of supported scopes, modes, constraints, and defaults.
- Operator Entitlements grant or deny a module and may have start/end timestamps and commercial metadata.
- Operator and Branch Feature Configuration may select only modes and values allowed for their declared scope by the current Entitlement and Feature Catalog definition. Branch overrides exist only when the catalog permits them.
- Server-side authorization and database write checks enforce Entitlements. Hiding UI alone is insufficient.
- Revocation prevents new use without deleting historical records. Existing data remains exportable under policy.
- Support overrides require a support context, reason, actor, expiration when temporary, and before/after audit event.
- The Core Plan contains the complete pilot suite. Later substantial modules are independently grantable Entitlements.

### 8.9 Storefront and leads

- Localized public routes exist for Turkish, English, and Arabic; Turkish is the default locale.
- The page explains the daily operational outcomes, multi-Branch model, supported languages, and contact/demo call to action.
- The page does not expose self-service checkout, self-service tenant creation, or a fixed public price during the founding phase.
- Lead capture accepts name, work contact method, dormitory/Operator name, approximate bed count, city, preferred language, optional message, and explicit privacy notice acceptance.
- Lead submission is server validated, rate-limited, bot protected, and idempotent. Private lead data is never readable through a public database policy.

### 8.10 Export and lifecycle

- Module exports support CSV with stable headers and UTF-8 encoding. A full Operator export is an asynchronous, access-controlled archive with a short-lived download link.
- Every export query is constrained by the caller's Operator and authorization before file generation. Export files are encrypted at rest and deleted after their documented download window.
- Suspension blocks customer login and mutation without deleting Operator Data.
- Archive, retention, deletion, and anonymization states are explicit. Exact time periods and lawful bases are a pre-production policy gate, not an implementer guess.
- Destructive lifecycle execution requires a dry-run manifest, narrowly resolved Operator target, authorization, audit event, and failure-safe retry behavior.

## 9. Application and Package Architecture

### 9.1 Monorepo

Use pnpm workspaces and Turborepo with this responsibility map:

| Path | Responsibility |
|---|---|
| `apps/storefront` | Public Next.js App Router deployment and lead capture |
| `apps/product-web` | Next.js App Router deployment containing Student App and Operator Dashboard |
| `apps/control-plane` | Separately deployed internal Next.js App Router application |
| `packages/domain` | Framework-independent domain vocabulary, value validation, state transitions, and authorization capability names |
| `packages/database` | Generated Supabase types, typed query boundaries, transaction/RPC clients, and repository adapters |
| `packages/auth` | Staff/session helpers, Student Credential Gateway contracts, role/capability resolution |
| `packages/ui` | Accessible design tokens and shared presentational components; no tenant data access |
| `packages/i18n` | Static translations, locale negotiation, formatting, and RTL rules |
| `packages/config` | Runtime environment validation and feature-catalog schemas |
| `packages/observability` | Structured logging, error reporting, correlation IDs, and redaction rules |
| `supabase` | Ordered migrations, local configuration, seed fixtures, database functions, and database/RLS tests |

Deployables may depend on packages. Packages must not import from applications. `domain` must not depend on Next.js or Supabase clients. Database access is server-only by default; browser Supabase clients are allowed only for authenticated, RLS-protected reads or realtime flows explicitly covered by policy tests.

### 9.2 Next.js interaction boundaries

- Use React Server Components for initial authenticated reads and dashboards.
- Use Server Actions for mutations initiated by Product Web or Control Plane forms.
- Use Route Handlers only for public lead submission, Student credential exchange, Public/QR Wi-Fi resolution, export downloads, health checks, webhooks, and later native-client interfaces.
- Default to the Node.js runtime because credential derivation, encryption, Supabase administrative calls, and observability integrations require server capabilities.
- Validate every external input at the server boundary with shared schemas. Client validation is a usability addition, not a security control.
- Return typed success or field/form-error results for expected failures. Unexpected failures go to application error boundaries with a correlation reference.
- Provide route-level loading, error, and not-found states for each application.
- Do not place tenant-sensitive data in shared caches. Any caching must include Operator, Branch, entitlement/version, locale, and authorization scope in the key or remain request scoped.

### 9.3 Background work

- A scheduled worker or protected scheduled Route Handler discovers due Attendance Sessions and Meal Days and calls idempotent database finalization functions.
- Finalization uses database transactions and uniqueness constraints rather than in-memory locks.
- Job attempts, outcome, duration, and correlation ID are recorded. Retries use bounded backoff and surface exhausted failures in the Control Plane.
- Export generation and lifecycle operations run asynchronously with explicit status and retry semantics.
- Scheduled endpoints authenticate the scheduler and never accept an Operator scope solely from an untrusted request body.

## 10. Data Model

### 10.1 General rules

- Use generated UUID primary keys for externally referenced records.
- Use `timestamptz` for instants, `date` for Branch-local service dates, IANA timezone names for zones, ISO language tags for locales, ISO 4217 currency codes, and `numeric` for money.
- Every customer-owned row includes `operator_id`. Every Branch-scoped row includes both `operator_id` and `branch_id`.
- Composite foreign keys or equivalent database checks guarantee that referenced Branches, Students, sessions, targets, and records belong to the same Operator.
- Add indexes for every foreign key and every column set used by RLS or primary operational queries. Composite indexes place equality/tenant columns before range/order columns.
- Use database constraints for statuses, positive capacity, supported enum-like values, unique natural relationships, and valid time ranges.
- All exposed tables have RLS enabled and explicit grants; default access is denied.

### 10.2 Required relations

| Relation | Required purpose and notable constraints |
|---|---|
| `operators` | Operator identity, status, defaults, legal/commercial references |
| `branches` | Operator-owned residence, active/archive status, timezone, locale, classification |
| `rooms` | Branch-owned room, unique Branch-local label, archive state |
| `beds` | Branch/room-owned bed, unique room-local label, availability/archive state |
| `profiles` | App profile linked one-to-one to `auth.users`; no authorization truth in editable metadata |
| `operator_memberships` | Operator staff membership role and status; unique active relationship |
| `branch_assignments` | Membership-to-Branch scope and Branch role; composite tenant integrity |
| `private.platform_memberships` | Prizic Platform Admin/Support identity, role, MFA eligibility, and lifecycle; separate from Operator membership |
| `private.support_contexts` | Time-bounded Prizic support access to one Operator, reason, approval/expiry, and lifecycle |
| `students` | Operator roster identity, stable public Access ID, preferred locale, lifecycle status |
| `student_branch_history` | Non-overlapping effective assignments; at most one open active assignment per Student |
| `private.student_credentials` | Auth-user mapping, Activation Code hash/version/expiry/use, lock/reset metadata; never exposed through Data API |
| `subscriptions` | One current Operator commercial agreement, status, start/end, pricing reference |
| `subscription_billing_periods` | Operator period, one external invoice reference, Billable Bed snapshot, and Branch breakdown |
| `feature_catalog` | Prizic-defined capability key, scope, supported modes, config schema/version |
| `operator_entitlements` | Operator capability grant, validity, constraints, commercial reference |
| `operator_feature_config` | Operator-scoped capability mode/config/version constrained by Entitlement/catalog |
| `branch_feature_config` | Optional Branch-scoped setting/override constrained by Entitlement/catalog and Operator-level rules |
| `attendance_sessions` | Branch/date, cutoff instant, lifecycle, unique Branch/date |
| `attendance_responses` | Session/Student unique current response plus version/update data |
| `attendance_snapshots` | Immutable finalized version, eligible roster count and totals |
| `attendance_corrections` | Append-only after-cutoff before/after, actor, reason, time |
| `meal_days` | Branch/service date/deadline/lifecycle, unique Branch/date |
| `meal_offerings` | Meal Day/type unique offering |
| `meal_responses` | Meal Day/Student unique explicit response, including empty response |
| `meal_selections` | Response/offering unique selection |
| `meal_snapshots` | Immutable finalized version and per-offering totals |
| `meal_corrections` | Append-only after-deadline before/after, actor, reason, time |
| `announcements` | Operator-owned draft/published/archive container and target-scope type |
| `announcement_targets` | Announcement-to-Branch targets with same-Operator integrity |
| `announcement_revisions` | Immutable revision number, source locale/content, publication metadata |
| `announcement_translations` | Revision/locale unique human-provided content |
| `announcement_recipients` | Revision/Student resolved audience and eligibility status |
| `announcement_acknowledgements` | Revision/Student unique explicit acknowledgment time |
| `student_balance_accounts` | Student/currency unique account |
| `student_balance_entries` | Append-only typed signed entry, optional reversal/due date, idempotency key |
| `wifi_access` | Branch current encrypted Wi-Fi payload, key version, selected mode, revision |
| `wifi_public_tokens` | Hashed high-entropy token, Branch, issue/revoke/expiry metadata |
| `audit_events` | Append-only actor/context/action/target/time and redacted structured change metadata |
| `background_job_runs` | Job key/attempt/status/timing/error reference; no tenant secrets |
| `leads` | Private Storefront intake, consent version/time, processing status |
| `exports` | Requester, Operator, scope, lifecycle, encrypted object reference, expiry |

Sensitive credential mappings and cryptographic material live in a non-exposed `private` schema. Raw cryptographic keys do not live in PostgreSQL. Views exposed through the Data API must use invoker security and must pass the same RLS tests as their underlying data.

## 11. Database Security and RLS

### 11.1 Policy rules

- Enable RLS on every table in an exposed schema, including reference/configuration tables.
- Revoke unnecessary table and function privileges from `anon` and `authenticated`; grants and RLS policies must both allow an operation.
- Student policies join `auth.uid()` to the active Student identity and restrict rows to the Student's own data or current Branch-visible data.
- Staff policies join `auth.uid()` to an active Operator membership and, when required, an active Branch assignment.
- Operator-wide roles are explicit database facts; they are not inferred from missing Branch assignments.
- Public visitors receive no direct table read for Wi-Fi or leads. Server endpoints perform the minimal validated operation.
- `UPDATE` paths have matching `SELECT`, `USING`, and `WITH CHECK` rules. Tenant identifiers cannot be changed through normal update paths.
- Wrap stable auth lookups such as `(select auth.uid())` where appropriate and index membership, assignment, Student-auth, Operator, Branch, and target columns used by policies.
- Security-definer functions are used only for transactions that cannot be safely expressed otherwise. They live outside exposed schemas, set an empty search path, fully qualify objects, explicitly check `auth.uid()`/service context, and have execute revoked from broad roles.
- The service-role key is limited to trusted server and job runtimes. It is never prefixed as public configuration, serialized to a client, or used as a substitute for caller authorization.

### 11.2 Mandatory negative cases

Database tests must prove denial for:

- Student to another Student in the same Branch.
- Student to another Branch or Operator.
- Branch Staff to an unassigned Branch in the same Operator.
- Any Operator user to another Operator.
- Inactive Student or staff membership.
- Stale Student access after transfer.
- Unentitled module mutation and unsupported configuration mode.
- Anonymous direct access to Wi-Fi, leads, or customer tables.
- Manipulated export and support-context scopes.

## 12. Localization, PWA, and Accessibility

- All static application and Storefront messages ship in Turkish, English, and Arabic from the first pilot release.
- Turkish is the fallback default; a user's stored preference overrides locale negotiation after authentication.
- Arabic sets document direction to RTL. Components must support bidirectional text and keep dates, amounts, codes, and network names understandable.
- Dates and times display in the relevant Branch timezone and selected locale; stored instants remain UTC.
- Operator-authored content is not automatically translated. Fallback content is labeled.
- Product Web includes a valid manifest, icons, theme metadata, standalone display behavior, and install guidance where supported.
- The pilot does not promise offline data reads or writes. Service-worker caching must not preserve sensitive authenticated pages or secrets across sign-out.
- Target WCAG 2.2 AA for primary workflows: keyboard access, visible focus, semantic structure, programmatic labels, sufficient contrast, live error/status announcements, and reduced-motion compatibility.

## 13. Observability and Audit

- Every request receives a correlation ID propagated through server logs, database/job metadata where useful, and unexpected-error responses.
- Structured logs include application, environment, route/action, actor class, Operator/Branch identifiers when authorized, result, and duration. They exclude PINs, Activation Codes, session tokens, Wi-Fi secrets, lead content, and sensitive financial descriptions.
- Error reporting groups unexpected failures and includes release/environment metadata without secret payloads.
- Health reporting covers deployable reachability, database connectivity, scheduler freshness, failed finalizations, failed exports, and authentication-gateway failures.
- Audit events are append-only and record actor identity/type, support context, Operator/Branch, action, target type/id, redacted before/after summary, reason when required, time, and correlation ID.
- Audit-worthy actions include role/assignment changes, roster lifecycle, transfers, credential issue/reset, Entitlements/configuration, Attendance/Meal corrections or reopens, Announcement publication/revision/archive, Balance entries/reversals, Wi-Fi changes/token rotation, export, suspension, and lifecycle execution.

## 14. Testing Strategy

Test through the highest stable seam. Prefer real local Supabase/PostgreSQL, deployed-like Next.js boundaries, and browser behavior over mocked internals.

### 14.1 Required verification layers

1. Database migration and constraint suite
   - Fresh local reset applies all migrations and seed fixtures.
   - Constraint tests cover same-Operator composite integrity, one active Student Branch, unique responses, idempotency keys, append-only records, and reversal rules.
2. RLS authorization suite
   - Execute SQL/API operations under representative JWT identities for every positive and mandatory negative case in section 11.2.
   - Run in CI for every schema or policy change.
3. Server-boundary integration suite
   - Exercise Student activation/login/reset, public Wi-Fi token resolution, lead submission, exports, finalization jobs, and transaction functions against real local dependencies.
   - Verify rate-limit/error contracts and idempotent retry behavior.
4. Browser end-to-end suite
   - Cover the primary Student and staff journey for each pilot module.
   - Cover multi-Branch switching, cross-Branch copied URLs, Student transfer, expired code, late Attendance/Meal submission, Announcement revision, Balance reversal, protected/public Wi-Fi, and suspension.
   - Run critical journeys in Turkish and smoke journeys in English and Arabic/RTL at mobile viewport; include desktop Operator smoke coverage.
5. Accessibility checks
   - Automated scans on core screens plus keyboard/focus assertions for dialogs, errors, navigation, and submission confirmation.
6. Deployment smoke suite
   - Verify all three deployables, environment validation, PWA manifest/install metadata, protected scheduled endpoints, migrations, and health signals in staging.

### 14.2 Release gates per vertical slice

- Acceptance stories for the slice pass at database, server-boundary, and browser levels as applicable.
- Cross-Operator and cross-Branch negative authorization tests pass.
- No unresolved critical or high-severity correctness/security defect.
- Observability distinguishes success, expected rejection, and unexpected failure.
- Turkish primary flow and English/Arabic smoke flows pass.
- A rollback or feature-disable procedure is documented and rehearsed in staging.
- Pilot testers receive a concise workflow script and a way to report a correlation reference.

Mock-heavy unit coverage is not a target. Unit tests are appropriate only for framework-independent domain rules with meaningful combinatorics, such as Balance sign/reversal rules, Branch-local cutoff conversion, entitlement resolution, and locale fallback.

## 15. Non-Functional Requirements

- Security: tenant isolation is database enforced; secret handling follows section 8.2 and 8.7; privileged access is least-privilege and audited.
- Correctness: time-cutoff and money-record workflows are transactional, idempotent, and use server/database time.
- Availability: pilot-critical Attendance and Meal reads remain diagnosable; failed jobs are retryable and visible.
- Performance: primary Student task pages should render useful content within 2.5 seconds at p75 on a typical mid-range mobile device and Turkish mobile network after authentication; mutations should acknowledge within 1 second at p75 excluding network outages.
- Scale: indexes and query shapes support Operators ranging from approximately 20 to 400+ beds and multiple Branches without changing the tenant model. Load tests use at least 1,000 Students in one Operator to expose avoidable full scans.
- Privacy: collect only required identity/operational fields; do not log secrets; publish a Turkish privacy notice and consent/version record for public leads.
- Recoverability: production has automated database backups and a documented restore test before formal pilot evaluation. Export/object storage follows documented recovery and expiry behavior.
- Browser support: current stable Safari/iOS, Chrome/Android, Chrome desktop, Edge, and Firefox for primary web flows. PWA installation availability may vary by platform; browser use remains supported.
- Maintainability: strict TypeScript, automated lint/format/type checks, generated database types, no application imports across deployables, and migration-only production schema changes.

## 16. Acceptance Criteria

The pilot build is ready for the formal evaluation when:

- All three web deployables are available in production with separate access boundaries.
- A Prizic Admin can create one Operator with multiple Branches, grant the Core Plan, and inspect audited support activity.
- An Operator Owner can manage Branches, beds, staff scope, Student roster/import, configuration, and export without seeing another Operator.
- A Student can activate with issued credentials, establish a PIN, sign in again, use all entitled Student workflows, transfer Branches without losing history, and be deactivated.
- Attendance and Meal cutoffs finalize reliably in Branch local time, are idempotent, preserve Unconfirmed states, permit only reasoned audited corrections, and provide usable exports.
- Announcements target the intended audience, fall back languages visibly, require explicit acknowledgment, and reset acknowledgment on revision.
- Student Balance derives correctly from append-only entries and reversals and never offers payment processing.
- Protected Wi-Fi requires current Branch membership; Public/QR Wi-Fi uses a revocable unguessable token and no anonymous direct table policy.
- Core feature Entitlements and allowed modes are enforced server-side and by database write rules.
- Turkish, English, and Arabic/RTL critical journeys and WCAG-focused checks pass.
- Mandatory RLS denial tests pass against a fresh migrated database.
- Production secrets, logs, analytics, caches, exports, and service-worker behavior pass the documented redaction/isolation review.
- Backup/restore, incident visibility, job retry, feature-disable, and Operator export have been exercised in staging.
- The retention/deletion policy, privacy notice, data-processing contract position, Founding Offer, and pilot measurement procedure are written and approved.

## 17. Explicitly Out of Scope

- Overnight Leave Requests, approvals, permissions, curfew enforcement, or treating Away as approved leave.
- Processing, collecting, transferring, settling, or refunding Student money; payment-provider integration; fiscal receipts; full Student ledger/accounting beyond recorded Balance entries.
- Dormitory accounting for revenue, food costs, salaries, expenses, payroll, bank reconciliation, or financial statements.
- Native iOS or Android applications, app-store release, native push notifications, or device-specific native features.
- SMS, WhatsApp, email campaign, or push delivery of operational notifications.
- Per-Student Wi-Fi provisioning, router/hardware integration, captive portal, or network access control.
- Offline-first data, offline mutations, conflict resolution, or guaranteed sensitive-page availability without a connection.
- AI or automatic translation of Operator-authored content.
- Self-service purchase, card checkout, automatic Subscription invoicing, or self-service Operator onboarding.
- Public fixed pricing before three paying Operators; the exact Founding Offer amount is a commercial agreement, not a hardcoded product constant.
- Customer-specific source-code forks, private deployments, arbitrary custom fields, arbitrary workflow builders, or customer-authored executable logic.
- Deep platform analytics, generalized CRM, sales pipeline, enterprise SSO, external SIS/ERP integrations, biometric attendance, hardware kiosks, or facial recognition.
- Cross-Operator Student identity/transfer, multi-country tax/compliance behavior, or markets outside Turkish independent private dormitories before the stated expansion threshold.
- Immediate permanent deletion that bypasses the approved retention/legal workflow.

## 18. Risks and Pre-Production Gates

| Risk | Required mitigation/gate |
|---|---|
| Full pilot suite, three languages, and three deployables are aggressive for one developer in six weeks | Protect the vertical order, use one shared design system/domain model, hide unfinished slices, and do not start post-pilot modules |
| PINs have less entropy than passwords | Server-keyed derivation, rate limits, temporary lockout, session revocation, one-time reset, redacted telemetry, and security review before production |
| Public/QR Wi-Fi can be reshared | Make exposure an explicit Branch choice, use unguessable revocable tokens, show the exposure warning, and never enable it by default |
| One shared database increases tenant-isolation impact | Deny-by-default RLS/grants, composite tenant constraints, mandatory negative tests, and no service role in clients |
| Branch-local deadlines are vulnerable to timezone/DST mistakes | Store IANA zone plus immutable UTC cutoff per session/day and test DST/boundary cases even though Turkey currently uses stable UTC+3 |
| Balance records may be mistaken for payment processing or accounting | Use precise UI language, append-only entries, explicit external-payment labeling, and the strict out-of-scope boundary |
| Serving dormitories of any size may conceal large-Operator requirements | Keep the tenant model size-neutral, validate at 1,000 Students, but defer enterprise integrations and bespoke controls |
| Retention and personal-data obligations are not yet numerically defined | Obtain Turkish legal/privacy review and approve written periods, legal bases, notices, deletion/anonymization, and export procedures before production |
| Founding price is not numerically settled in product docs | Agree the paid offer in writing before the 14-day evaluation; keep price out of code except configurable commercial records |
| Adoption can fail even when software works | Onboard one live Operator, release one daily loop at a time, measure actual response/reliance, and require paid conversion for success |

## 19. Ticketing Boundary

Ticket decomposition must preserve the vertical order in section 5.2. Foundation tickets may create shared capabilities only when needed by the next tracer-bullet workflow. Each ticket must point to the user stories and acceptance criteria it closes, state its database/RLS impact, and include its highest-level verification seam.

This specification is stored locally because no repository issue tracker is configured yet. It cannot receive a `ready-for-agent` tracker label until engineering workflow setup or repository creation is complete.
