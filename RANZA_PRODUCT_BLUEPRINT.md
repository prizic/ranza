# Ranza Product Blueprint

**Status:** Product and architecture source of truth  
**Audience:** Product, design, engineering, operations, sales, support, and AI coding agents  
**Purpose:** Define Ranza from product vision through application architecture as a complete standalone source of truth.

---

## 1. Product Definition

Ranza is a multilingual, modular, white-label hospitality and accommodation ERP delivered as one multi-tenant SaaS platform.

It is designed for organizations that operate one or more accommodation properties, including hotels, hostels, student residences, serviced residences, staff housing, and similar businesses.

Ranza unifies property operations, guest or resident services, finance, inventory, procurement, human resources, CRM, and analytics. Organizations subscribe to the capabilities they need through plans, bundles, and module Entitlements. Every subscribed organization uses the same platform and release line.

Ranza is not a collection of customer-specific products, templates, or source-code forks.

### Product promise

Ranza gives accommodation operators one reliable system of record for running properties, coordinating teams, serving Guests and Residents, controlling costs, and understanding performance.

### Core principles

1. One platform, one codebase family, and one release line.
2. Organization differences are expressed through branding, Entitlements, configuration, terminology, locale, and permissions—not forks.
3. Every module owns its business rules and data.
4. Cross-module workflows use explicit contracts and auditable transactions.
5. Security, tenant isolation, auditability, data export, and accessibility are baseline platform capabilities, never paid safety features.
6. Web and PWA experiences are the default. Native mobile applications require validated device-specific needs.
7. Turkish, English, and Arabic with full RTL support are first-class product requirements.

---

## 2. Canonical Domain Language

The following language is binding in product documents, interfaces, code, database naming, issues, and AI prompts.

### Organization

The business that subscribes to Ranza and operates one or more Properties. It holds the Subscription and receives consolidated invoices.

Avoid using `tenant` in user-facing product language. Technical tenancy documentation may use `tenant isolation`, but business concepts should use **Organization**.

### Property

A physical accommodation site operated by an Organization. A Property may contain buildings, floors, rooms, beds, outlets, stores, kitchens, and service areas.

### Staff Member

A person working for an Organization. Access depends on role, module, action, Property, department, and outlet assignments.

### Guest

A person associated with a short-term or reservation-based stay.

### Resident

A person associated with longer-term accommodation. A Student is a supported Resident type when a Property serves student accommodation.

### Accommodation Unit

A sellable or assignable space. Depending on Property configuration, this may be a room, bed, apartment, suite, or another supported unit type.

### Stay

The operational record connecting a Guest or Resident to an Accommodation Unit for a defined period.

### Reservation

A planned allocation request that may become a Stay through check-in or activation.

### Folio

The financial record that collects charges, credits, taxes, adjustments, and payments associated with a Guest, Resident, group, company, or Stay.

### Subscription

The commercial agreement held by an Organization. It defines billing terms, usage limits, plan membership, and Entitlements across the Organization's Properties.

### Entitlement

Permission for an Organization to use a module or supported capability under its Subscription.

### Feature Configuration

A supported behavioral mode or value selected at Organization, Property, department, or outlet scope. Configuration changes behavior within supported boundaries; they do not create bespoke code.

### White-label Configuration

Supported presentation settings such as brand name, logo, colors, typography, domains, email identity, and approved terminology mappings.

---

## 3. Commercial Model

Ranza is sold as one SaaS product with subscription-gated capabilities.

### 3.1 Platform Core

Every Subscription includes the non-optional foundation:

- Organization and Property structure
- Identity, authentication, and authorization
- Role and assignment management
- Localization and RTL support
- White-label presentation controls
- Audit records
- Security and tenant isolation
- Data export and retention controls
- Notification infrastructure
- Basic operational reporting
- Health, observability, and support controls

### 3.2 Plans and bundles

Plans are commercial packages containing predefined Entitlements and limits. Ranza may offer bundles suited to different operating models, but bundles do not create different products or codebases.

Example bundles may include:

- Accommodation Operations
- Full-Service Hotel
- Long-Stay Residence
- Food and Beverage Operations
- Full ERP

These names are illustrative commercial packaging, not separate technical editions.

### 3.3 Add-on modules

An Organization may add entitled modules without migrating data or changing platforms. Candidate add-ons include Inventory, Procurement, Accounting, HR and Payroll, CRM, advanced Analytics, and specialized Guest services.

### 3.4 Billing dimensions

Pricing may combine:

- Base Organization subscription
- Number of active Properties
- Number of billable rooms, beds, or Accommodation Units
- Enabled modules
- Staff seats for selected back-office capabilities
- Transaction or usage bands where commercially appropriate

One Organization receives one consolidated invoice, optionally showing Property- and module-level breakdowns.

### 3.5 Entitlement enforcement

Access to a capability requires all of the following:

1. The Organization has an active Subscription.
2. The Subscription includes the required Entitlement.
3. The capability is enabled for the relevant Property or operational scope.
4. The Staff Member or portal user has permission for the action.
5. Data-layer policies allow access to the record.

The interface may explain or promote unavailable capabilities, but hiding a control is never the security boundary. Unauthorized server and database operations must fail safely.

### 3.6 Recommended package catalog

Ranza's commercial catalog should use a stable Core plus clearly bounded bundles and add-ons. Exact prices and limits remain commercial decisions.

| Package               | Intended capabilities                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ranza Core**        | Organization and Property foundation, identity and permissions, PMS/front office, Guest and Resident profiles, basic housekeeping, Folios, basic reporting, audit, localization, and configuration |
| **Growth**            | Booking engine, channel management, CRM, Guest communication, digital check-in, reputation workflows, and upsells                                                                                  |
| **Operations**        | Advanced housekeeping, maintenance, Inventory, Procurement, suppliers, and cross-department task management                                                                                        |
| **ERP**               | Accounting, Finance, HR, Payroll, consolidated reporting, and advanced controls                                                                                                                    |
| **Revenue**           | Forecasting, revenue management, pricing recommendations, and advanced commercial analytics                                                                                                        |
| **Food and Beverage** | POS, KOT, recipes/BOM, stock consumption, Folio posting, and outlet reporting                                                                                                                      |
| **Enterprise**        | Multi-Property control center, SSO, custom dashboards, governed API capacity, data-warehouse exports, and premium support                                                                          |

Security, tenant isolation, audit integrity, accessibility, and Organization Data export remain baseline rights and must not be removed by package selection.

---

## 4. Application Strategy

Ranza uses four deployable applications.

### 4.1 Storefront

A public responsive website for product explanation, module discovery, demonstration requests, contact capture, and approved public pricing.

The Storefront does not share authenticated operational routes with the product applications.

### 4.2 Operator Workspace

The main authenticated responsive web application for Organization owners, managers, and Staff Members.

It supports desktop-heavy workflows such as reservations, finance, reporting, configuration, procurement, HR, and analytics. It also contains role-adaptive mobile views for housekeeping, maintenance, F&B, stock, and other floor operations.

The Operator Workspace is installable as a PWA. Mobile operational views use the same authorization and module contracts as desktop views.

### 4.3 Guest/Resident Portal

A mobile-first responsive PWA for Guests, Residents, and Students. Available capabilities depend on the Organization's Entitlements and Property configuration.

Possible capabilities include:

- Reservation and stay information
- Pre-arrival information
- Digital registration or forms
- Service requests
- Announcements and acknowledgments
- Meal choices
- Attendance or presence declarations where configured
- Balance and folio viewing
- Wi-Fi and Property information
- Feedback and communication preferences

The Portal must never expose staff controls or Prizic operations.

### 4.4 Prizic Control Plane

The internal web application used by authorized Prizic personnel to manage:

- Organization and Property lifecycle
- Plans, Entitlements, trials, and limits
- Supported Feature Configuration capabilities
- Subscription state and billing references
- White-label domains and configuration
- Service health and platform status
- Audited support actions
- Data lifecycle operations

High-risk support actions require strong authentication, explicit authorization, a reason, and an immutable audit record.

### 4.5 Native mobile policy

Ranza must not build native iOS or Android applications merely to duplicate responsive web screens.

Native applications should be considered only when validated workflows require capabilities such as:

- Digital room keys or secure wallet integration
- NFC or specialized hardware
- Intensive barcode or document scanning
- Deep offline operation with complex synchronization
- Reliable background tasks unavailable to the PWA
- Device management requirements
- Native push behavior essential to safety or operations

Until then, PWAs provide the lowest-cost and fastest shared delivery path across desktop, tablet, and mobile.

### 4.6 Operator Workspace information architecture

The authenticated shell should organize navigation around jobs rather than expose a flat list of every ERP module.

- Today
- Front Office
- Guest Experience
- Housekeeping
- Food and Beverage
- Inventory and Procurement
- Finance
- People
- CRM
- Analytics
- Configuration

The shell includes an Organization and Property switcher, global search, a command palette, recent records, saved views, notifications, and contextual help. Everyday navigation shows only entitled and permitted capabilities. Owners may access a separate **Explore modules** area; locked upsells must not clutter operational navigation.

### 4.7 Role-adaptive experiences

One authenticated application may present different work modes without creating separate codebases:

- Front-desk mode prioritizes arrivals, departures, Reservations, unit assignment, Folios, and Guest requests.
- Housekeeping mode prioritizes assigned Accommodation Units, readiness, inspections, linen, evidence, and issues.
- Maintenance mode prioritizes faults, severity, location, parts, handover, and return-to-service.
- F&B mode prioritizes orders, kitchen tickets, service state, and Folio posting.
- Inventory mode prioritizes receiving, counting, transfers, issues, and barcode or QR scanning.
- Manager mode prioritizes exceptions, approvals, shift handover, operating metrics, and unresolved risks.

These modes share identity, permissions, contracts, design tokens, and data ownership rules. They are not separate products.

---

## 5. Product Modules

### 5.1 Platform Core

Owns Organizations, Properties, users, roles, assignments, localization, branding, Entitlements, configuration, audit infrastructure, notifications, and shared reference data.

### 5.2 Property and Accommodation Management

Owns buildings, floors, Accommodation Units, capacity, unit types, occupancy rules, availability, room or bed assignments, transfers, and operational unit status.

### 5.3 Reservations and Front Office

Owns individual and group reservations, availability search, quotations, deposits as records, arrival and departure workflows, check-in, check-out, extensions, cancellations, no-shows, room moves, and front-desk operational views.

### 5.4 Housekeeping

Owns cleaning tasks, inspections, room readiness, linen status, minibar observations, assignment queues, priority, completion evidence, and housekeeping productivity.

Housekeeping does not directly override stay or reservation records. Room-status transitions follow a controlled lifecycle.

### 5.5 Guest and Resident Services

Owns service requests, announcements, acknowledgment workflows, communication preferences, feedback, Property information, supported attendance declarations, and long-stay resident interactions.

### 5.6 Food and Beverage

Owns outlets, menus, modifiers, orders, kitchen tickets, table or service context, meal plans, room service, minibar charges, banquet service, voids, discounts, and outlet settlement workflows.

### 5.7 Inventory

Owns items, units of measure, locations, stock quantities, reservations, issues, transfers, counts, wastage, adjustments, valuation inputs, and immutable stock movements.

### 5.8 Procurement

Owns suppliers, requisitions, approvals, requests for quotation, purchase orders, goods received notes, returns, supplier invoices, and purchasing performance.

### 5.9 Billing and Folios

Owns folios, charge routing, line items, taxes, discounts, credits, adjustments, deposits as recorded value, payment records, refunds as records, split folios, company billing, and folio closure.

External payment processing is a separately entitled integration. Financial records must distinguish recording money movement from actually processing or transferring money.

### 5.10 Accounting and Finance

Owns chart of accounts, journal entries, accounting periods, receivables, payables, cash and bank records, cost centers, tax configuration, reconciliation, financial statements, and controlled period close.

Operational modules provide approved posting events; they do not write arbitrary journal entries.

### 5.11 Human Resources and Payroll

Owns employee records, departments, positions, contracts, schedules, attendance, leave, payroll inputs, payroll runs, payslips, and workforce reporting.

Access to HR and payroll data requires stricter permissions than general staff administration.

### 5.12 CRM

Owns profiles, organizations and travel agents, preferences, communication consent, interaction history, feedback, segmentation, campaigns, loyalty concepts, and relationship insights.

CRM identity matching must avoid silently merging different people.

### 5.13 Maintenance and Facilities

Owns assets, preventive maintenance, work orders, faults, priorities, technicians, external vendors, downtime, costs, and return-to-service confirmation.

### 5.14 Analytics and Reporting

Provides operational, commercial, financial, workforce, inventory, procurement, service, and multi-Property analysis using governed metrics.

Analytics reads trusted module events and reporting models. It must not become the owner of operational truth.

### 5.15 Integrations

Provides controlled connections to payment providers, fiscal or accounting systems, channel managers, door-lock providers, messaging services, email, identity providers, government systems, and approved third-party APIs.

Every integration must define ownership, retry behavior, idempotency, monitoring, failure recovery, and data-sharing boundaries.

### 5.16 Distribution and Revenue

Owns direct booking, channel inventory and restrictions, rate plans, packages, availability publication, forecasting, pricing recommendations, and distribution reconciliation. Channel connectivity must prevent duplicate Reservations and make synchronization failures operationally visible.

### 5.17 Tasks and Shift Handover

Owns cross-department tasks, queues, assignment, priority, due time, service-level targets, escalation, comments, evidence, completion, and shift handover notes. It coordinates work but does not take ownership of the underlying Reservation, Accommodation Unit, stock item, Folio, or maintenance asset.

### 5.18 Loyalty and Upsells

Loyalty is an optional Entitlement that may own memberships, tiers, points, rewards, earning rules, and redemption records. Upsells attach eligible products and services to controlled lifecycle moments such as booking, pre-arrival, check-in, in-stay service, and checkout. Neither capability belongs in the mandatory PMS core.

### 5.19 Bookable Resources

Ranza may represent parking spaces, meeting rooms, desks, equipment, spa slots, and similar resources through a generic availability and booking capability. Accommodation Units retain their specialized stay and occupancy rules; generic resources must not dilute the accommodation model.

---

## 6. Cross-Module Workflows

Cross-module activity must use explicit application services, domain commands, events, or controlled database functions. A shared database does not permit one module to freely update another module's tables.

### 6.1 Arrival and room readiness

1. Front Office identifies an arriving Reservation.
2. Property Management verifies an assignable Accommodation Unit.
3. Housekeeping confirms the unit is ready.
4. Front Office completes check-in and creates or activates the Stay.
5. Billing creates or links the correct Folio.
6. CRM and Analytics receive approved events.

### 6.2 F&B sale charged to a Folio

1. F&B validates the order and service context.
2. Billing validates the target Folio and posts the charge idempotently.
3. Inventory consumes recipe or bill-of-material quantities through stock movements.
4. Analytics records revenue and operational metrics.
5. Voids or corrections create reversing records; they do not erase history.

### 6.3 Replenishment and purchasing

1. Inventory detects stock below a configured threshold.
2. Procurement creates a suggestion or requisition.
3. Authorized Staff approve and issue a purchase order.
4. A goods received note creates Inventory receipts.
5. The supplier invoice is matched and passed to Accounts Payable.
6. Exceptions remain visible until resolved.

### 6.4 Night audit or business-day close

1. Operational modules finalize eligible daily transactions.
2. Billing validates open folios and pending postings.
3. Approved summaries or detailed posting events reach Accounting.
4. Exceptions are reported without silently dropping data.
5. The close is auditable, repeatable where safe, and protected from duplicate posting.

### 6.5 Room issue and maintenance

1. Staff report a fault against an Accommodation Unit or asset.
2. Maintenance assesses severity and operational impact.
3. Property Management may mark the unit unavailable through a controlled transition.
4. Front Office sees the availability impact.
5. After repair and any required inspection, the unit returns to service.

### 6.6 Digital pre-arrival and check-in

1. Reservations determines whether the booking is eligible for a digital journey.
2. Guest Services collects only the required registration, consent, arrival, and preference information.
3. Identity and security controls verify the user and protect sensitive documents.
4. Billing presents eligible deposits, balances, and upsells through controlled interfaces.
5. Front Office reviews exceptions and completes the authoritative check-in transition.
6. Accommodation Management activates the assignment, while CRM and Analytics receive approved events.

Digital self-service assists the operating team; it does not silently bypass Front Office controls, legal registration, payment requirements, unit readiness, or identity verification.

### 6.7 Shift handover

1. Operational modules surface unresolved exceptions and due work through the Tasks capability.
2. The outgoing shift records material context, ownership, urgency, and required follow-up.
3. The incoming shift acknowledges the handover and assumes assigned work.
4. Completed, reassigned, overdue, and escalated states remain auditable.
5. The handover summary links to authoritative module records instead of duplicating their mutable data.

### 6.8 Integration failure recovery

1. The owning module records the intended business operation and idempotency key.
2. The integration adapter attempts delivery and records the provider response.
3. Retryable failures enter a controlled retry schedule; permanent failures become visible exceptions.
4. Authorized Staff can retry, resolve, or cancel according to module rules.
5. Reconciliation proves whether the external and Ranza states agree.

---

## 7. Tenancy, Data Ownership, and Security

### 7.1 Tenant isolation

Every Organization is isolated from every other Organization at the database layer. Application checks supplement database enforcement; they do not replace it.

All tenant-owned records must carry or derive an unambiguous Organization scope. Property-scoped records must also be constrained to a Property belonging to that Organization.

### 7.2 Authorization dimensions

Authorization may depend on:

- Organization
- Property
- Module
- Action
- Department
- Outlet or store location
- Assigned record or work queue
- Data sensitivity
- Entitlement and configuration state

Permissions are additive only inside one Organization and must never grant cross-Organization access.

### 7.3 Module data ownership

Each module is the sole authority for its mutable business records. Other modules interact through defined contracts. Shared reference identifiers do not imply shared write ownership.

### 7.4 Auditability

Sensitive actions record actor, time, Organization, Property, action, target, reason when required, and relevant before/after facts. Audit records must be tamper-resistant and must not store secrets unnecessarily.

Corrections use revision, adjustment, reversal, reopen, or supersession workflows. Financial, stock, access, and operational history must not be silently overwritten.

### 7.5 Data lifecycle

Ranza must support export, retention, archival, legal hold where required, deletion, and anonymization according to contracts and applicable law. Prizic support access must be limited, justified, and audited.

### 7.6 Security baseline

The platform requires secure authentication, strong session management, MFA for privileged roles, least privilege, encryption in transit and at rest, rate limiting, secret management, dependency monitoring, backup and restore testing, incident response, and security logging.

---

## 8. White-Label Model

White-labeling is configuration, not source-code duplication.

Supported configuration may include:

- Brand name and logo
- Color and typography tokens
- Custom domains
- Email sender identity and templates
- Approved terminology mappings
- Locale defaults
- Property-specific public information
- Feature visibility within entitled boundaries

White-label configuration must not:

- Change security rules
- Bypass Entitlements
- Create customer-specific database schemas
- Introduce unmaintained code branches
- Allow arbitrary executable code
- Redefine financial or audit semantics

---

## 9. Technical Architecture

### 9.1 Architectural style

Ranza should use a modular monolith first: independently owned domain modules deployed through a small number of applications and backed by one governed data platform per environment.

Modules must have narrow public interfaces and explicit dependencies. They may later be extracted only when scale, reliability, team ownership, or deployment requirements justify the operational cost.

### 9.2 Repository shape

A recommended pnpm and Turborepo structure is:

```text
apps/
  storefront/
  operator-workspace/
  guest-portal/
  control-plane/
packages/
  auth/
  config/
  database/
  domain/
  entitlements/
  i18n/
  integrations/
  observability/
  ui/
  validation/
supabase/
  migrations/
  tests/
docs/
  adr/
  specs/
  runbooks/
```

The exact names may evolve, but application and module boundaries must remain enforceable through automated dependency rules.

### 9.3 Web platform

The web applications may use Next.js and shared TypeScript packages. Shared UI primitives must support responsive behavior, accessibility, theming, Turkish, English, Arabic, and RTL without application-specific forks.

### 9.4 Data platform

PostgreSQL is the system of record. When Supabase is used, Row-Level Security must enforce Organization isolation. Development, staging, and production use separate backend environments.

Database migrations are versioned, reviewable, forward-tested, and accompanied by policy and database tests where relevant.

### 9.5 APIs and commands

Clients call documented server-side operations. Privileged business mutations should not rely on unrestricted client-side table access. Operations that cross module boundaries require validation, authorization, idempotency where relevant, and a defined transaction or recovery strategy.

### 9.6 Asynchronous work

Background jobs and domain events may handle notifications, analytics projections, integrations, document generation, and non-critical cross-module reactions. Critical state changes must define delivery guarantees, retry limits, dead-letter handling, and operator visibility.

### 9.7 Observability

Every deployable exposes health and readiness information. Logs, metrics, traces, job failures, integration failures, security events, and audit trails must be correlated without leaking personal or financial data.

### 9.8 Bounded contexts and product-line architecture

Ranza is a modular monolith composed of explicit bounded contexts. Domain-Driven Design defines ownership and language; commands, contracts, and events define communication. Domain boundaries and event-driven communication are complementary, not competing architecture choices.

The broader Prizic software product line distinguishes three categories:

| Category                    | Examples                                                                                                            | Reuse policy                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Prizic Platform Modules** | Finance foundations, Inventory, Procurement, notifications, audit, files, generic tasks, integration infrastructure | Designed to be host-agnostic and potentially reusable across products |
| **Ranza Domain Modules**    | Accommodation, Reservations, Stays, Housekeeping, Guest services, Folios, hospitality F&B                           | Owned by Ranza and allowed to use hospitality language                |
| **Host Adapters**           | Folio-to-posting, F&B-to-stock consumption, Reservation-to-notification                                             | Thin mappings that connect Ranza concepts to generic module contracts |

A reusable Platform Module must not import or reference `Property`, `Guest`, `Resident`, `Stay`, `Reservation`, `AccommodationUnit`, `Folio`, or another Ranza-specific concept. The host adapter performs that translation.

### 9.9 Reuse policy

Reusable modules should remain inside the monorepo initially. Their independence must be enforced before they are published through a private registry. A module should be distributed as a versioned package only when a second real product needs it and its public contract has proven stable.

Strong initial reuse candidates are Finance foundations, Inventory, Procurement, notifications, audit, files, generic tasks, and integration infrastructure. HR, Payroll, CRM, Billing, and tax behavior require additional caution because jurisdiction and product semantics can make premature generalization harmful.

The boundary change test is binding: a normal hospitality rule change should affect a Ranza module or adapter, not force a change inside a generic Platform Module.

### 9.10 Module anatomy

Each reusable module owns:

1. A domain layer containing framework-independent rules and invariants.
2. An application layer containing commands, queries, and use cases.
3. A deliberately small public contract containing supported types, commands, queries, and events.
4. Infrastructure adapters for PostgreSQL, messaging, files, or external systems.
5. Its database schema, migrations, Row-Level Security policies, and data tests.
6. Domain, integration, migration, and tenant-isolation tests.
7. Documentation, a changelog, and an upgrade path.

Applications and other modules may import only the public contract. Automated dependency rules must reject imports from another module's domain, application internals, infrastructure, generated database client, or private tables.

### 9.11 Recommended package shape

```text
packages/
  platform/
    finance/
    inventory/
    procurement/
    notifications/
    audit/
    files/
    tasks/
    integrations/
  ranza/
    accommodation/
    reservations/
    stays/
    housekeeping/
    guest-services/
    folios/
    food-and-beverage/
  adapters/
    ranza-finance/
    ranza-inventory/
    ranza-notifications/
```

Package names express ownership. The physical repository structure may evolve, but the platform, product-domain, and host-adapter distinction must remain explicit.

### 9.12 Database ownership and schemas

Each module owns a PostgreSQL schema or another equally enforceable namespace, along with its migrations and policies. No other module writes directly to those tables. Cross-module reporting uses governed read models, views, exported contracts, or analytics projections rather than uncontrolled joins embedded throughout application code.

Tenant-owned tables carry or securely derive `organization_id`. Property-scoped tables also carry or derive a valid Property belonging to that Organization. Foreign references across module boundaries use stable identifiers and explicit consistency rules rather than shared mutable ORM models.

### 9.13 Supabase and Prisma responsibilities

Supabase provides managed PostgreSQL, authentication, storage, and selected Realtime capabilities. It is infrastructure, not the application or domain layer.

Prisma may provide server-side type-safe database access and versioned schema definitions. Prisma does not own Row-Level Security policy creation, so RLS policies remain explicit SQL migrations owned and tested by the module.

Sensitive mutations execute through server-side application operations. Direct browser table mutations must not be used for financial, inventory, entitlement, identity, privileged operational, or cross-module state changes.

The runtime database role must remain subject to tenant isolation. If an administrative or migration role bypasses RLS, it must never be used as the ordinary application runtime identity. Every server query is still explicitly scoped by Organization and, where relevant, Property.

### 9.14 Connection management

Runtime queries use an approved pooled connection suitable for the deployment model. Migrations and administrative operations use a separate direct connection with tightly controlled credentials. Client creation, connection limits, timeouts, and pool sizing must be load-tested and monitored.

Exact ports, query parameters, Prisma configuration, and provider-specific connection strings belong in a versioned engineering runbook because they change across Prisma and Supabase versions. The blueprint defines the separation and safety requirements, not volatile configuration syntax.

### 9.15 Commands and events

Use synchronous commands or application services when the caller requires an immediate authoritative result. Use events for reactions, projections, notifications, analytics, and external integration.

Events must not become a way to hide unclear ownership. Reliable cross-module events require a transactional outbox or an equivalent atomic publication design, idempotent consumers, retry limits, dead-letter handling, correlation identifiers, schema versioning, replay rules, and operational visibility.

Financial posting, Inventory movements, external payments, supplier operations, and other duplicate-sensitive commands require idempotency keys and immutable outcome records.

### 9.16 Package and migration versioning

Internal packages follow Semantic Versioning. Public contracts remain deliberately small. Database migrations travel with the owning module and run in a defined order.

Schema evolution should prefer expand, migrate, and contract:

1. Add backward-compatible schema and contract support.
2. Migrate or backfill existing data safely.
3. Move all consumers to the new contract.
4. Remove the old shape only in a controlled breaking release.

Breaking contract or schema changes require a major version, compatibility notes, migration instructions, rollback or forward-recovery guidance, and verification against every consuming application.

---

## 10. Localization and Accessibility

Ranza launches with Turkish, English, and Arabic.

Requirements include:

- Locale-aware routing and formatting
- Correct RTL layout and mirrored interaction patterns for Arabic
- Translation keys rather than hardcoded interface strings
- Locale-aware dates, times, numbers, currency, and time zones
- Property-local business dates and cutoff times
- Accessible keyboard navigation
- Sufficient color contrast
- Screen-reader labels and status announcements
- Touch targets suitable for mobile operational use
- No meaning communicated by color alone

User-entered content remains distinguishable from translated system text.

### 10.1 Turkey regional capability pack

Turkey is a first-class launch market. Regional capabilities should be implemented behind governed interfaces so that Turkish requirements do not leak into generic accounting, identity, or document modules.

The regional pack may include:

- KVKK consent, disclosure, retention, access, and deletion workflows
- TRY currency and Turkish locale defaults
- Turkish tax and accounting mappings
- E-invoice and e-archive integrations
- Fiscal document numbering and immutable document references
- Türkiye-specific identity, accommodation, tourism, and public-system integrations when legally required
- Local payment, banking, messaging, and channel integrations

Legal and accounting behavior requires qualified review. Configuration must never substitute for verified compliance.

---

## 11. Key User Stories

1. As an Organization owner, I want to manage all Properties under one Subscription so that I can operate the business centrally.
2. As an Organization owner, I want to enable subscribed modules by Property so that each site uses the right capabilities.
3. As an Organization owner, I want consolidated billing with Property breakdowns so that charges remain understandable.
4. As a Manager, I want access only to my assigned operational scope so that sensitive data remains protected.
5. As a front-desk Staff Member, I want to manage Reservations, arrivals, departures, and transfers so that occupancy stays accurate.
6. As a front-desk Staff Member, I want live room-readiness information so that I do not assign an unprepared unit.
7. As a housekeeping supervisor, I want to assign and prioritize cleaning work so that rooms become ready on time.
8. As a housekeeper, I want a focused mobile work queue so that I can complete tasks away from a desk.
9. As a maintenance Staff Member, I want to record and resolve faults so that unsafe or unavailable units are controlled.
10. As an F&B Staff Member, I want to manage orders and kitchen tickets so that service is coordinated.
11. As an authorized Staff Member, I want to post an F&B charge to a Folio so that the Guest receives one accurate account.
12. As an inventory controller, I want every stock change recorded as a movement so that quantities are explainable.
13. As a purchaser, I want low-stock needs to become controlled requisitions so that shortages are prevented without uncontrolled ordering.
14. As an approver, I want purchasing thresholds and approval steps so that spending follows policy.
15. As an accounts payable Staff Member, I want to match purchase orders, receipts, and invoices so that exceptions are visible.
16. As a finance Staff Member, I want operational transactions posted through controlled accounting rules so that journals remain reliable.
17. As a finance manager, I want period-close protections and reversals so that historical statements are not silently changed.
18. As an HR Staff Member, I want employee, schedule, leave, and payroll workflows so that workforce administration is centralized.
19. As a CRM Staff Member, I want a trustworthy interaction and preference history so that service can be personalized appropriately.
20. As an analyst, I want governed metrics across Properties and modules so that comparisons use consistent definitions.
21. As a Guest, I want mobile access to my Stay and service information so that I can self-serve common needs.
22. As a Resident, I want access to configured long-stay services so that I can interact with the Property without visiting an office.
23. As a portal user, I want to use Ranza in my supported language and direction so that the interface is understandable.
24. As a Prizic administrator, I want to manage Organizations, Properties, plans, and Entitlements so that access matches commercial agreements.
25. As a Prizic support Staff Member, I want approved, audited support operations so that I can help without hidden access.
26. As a security reviewer, I want database-enforced Organization isolation so that an application defect cannot expose another Organization's data.
27. As an Organization owner, I want to export my Organization Data so that I retain operational control and meet legal needs.
28. As an integration operator, I want failed external operations to be retryable and visible so that failures do not disappear silently.
29. As a brand administrator, I want supported branding controls so that Ranza matches the Organization without creating a fork.
30. As a Staff Member without an Entitlement or permission, I want a clear access explanation so that I understand why a capability is unavailable.

---

## 12. Quality and Acceptance Requirements

Every production module must include appropriate evidence for:

- Cross-Organization denial at the database and application layers
- Role, Property, module, and action authorization
- Entitlement and configuration enforcement
- Audit coverage for sensitive actions
- Turkish, English, Arabic, and RTL journeys
- Responsive desktop, tablet, and mobile behavior
- Accessibility of primary workflows
- Idempotency and duplicate protection where required
- Correction, reversal, and failure-recovery behavior
- Migration safety and rollback or forward-recovery procedures
- Backup restoration
- Performance at defined Organization and Property sizes
- Browser and PWA compatibility
- Monitoring, alerting, and support runbooks
- Public-contract and dependency-boundary enforcement
- Migration compatibility across supported package versions
- Runtime database roles remaining subject to tenant isolation
- Outbox, retry, idempotency, and replay behavior for reliable events
- Import preview, reconciliation, and rollback or correction behavior
- Adoption and parallel-operation exit criteria where a workflow replaces an existing process

The release gate should run formatting, boundary checks, linting, type checking, automated tests, database policy tests, builds, end-to-end journeys, and health smoke tests.

---

## 13. Delivery Strategy

Ranza must be delivered in coherent vertical slices, not by building every database table before usable workflows exist.

### Phase 1: Platform foundation

- Organization and Property model
- Identity, roles, assignments, and MFA
- Entitlements and Feature Configuration
- White-label tokens and domains
- Localization and RTL
- Audit, observability, notifications, and data lifecycle foundation
- Storefront, Operator Workspace, Guest/Resident Portal shell, and Control Plane
- Bounded-context dependency rules and public module contracts
- Runtime database roles, RLS verification, pooled runtime connections, and direct migration connections
- Generic notification, audit, file, task, and integration foundations

### Phase 2: Accommodation operations

- Property structure and Accommodation Units
- Reservations, availability, Stays, check-in, check-out, and transfers
- Housekeeping room-status lifecycle
- Folio foundation
- Guest and Resident profiles
- Reservation timeline, operational command center, and Guest 360 foundation
- Guided import, setup, training, and rollout evidence

### Phase 3: Operational services

- Guest and Resident services
- F&B and meal workflows
- Maintenance and facilities
- Inventory movements and stock control
- Procurement through receiving

### Phase 4: Back-office ERP

- Accounts receivable and payable
- General ledger and financial close
- HR and payroll
- CRM and communication workflows
- Cross-module analytics

### Phase 5: Ecosystem and optimization

- External payments
- Channel and distribution integrations
- Door locks and specialized devices
- Advanced forecasting and revenue optimization
- Native applications only where validated
- Public APIs, webhooks, integration catalog, and governed extension surfaces
- Reusable Platform Module publication only when a second real product requires it

Each phase must define measurable operating outcomes and may be sold through Entitlements as capabilities become production-ready.

---

## 14. Explicit Non-Goals and Guardrails

Unless a later approved specification says otherwise, Ranza must not:

- Create source-code forks for Organizations or industries
- Duplicate the platform into separate hotel, hostel, or residence products
- Build a native app solely for marketing value
- Allow one module to update another module's owned tables directly
- Treat hidden navigation as authorization
- Make security, audit, data export, or accessibility optional paid features
- Process payments merely because it records payments or balances
- Delete financial, stock, audit, or operational history to perform corrections
- Mix Prizic Control Plane permissions with Organization staff permissions
- Share one backend instance across development, staging, and production
- Add microservices without a demonstrated operational need
- Permit arbitrary per-Organization executable customization
- Use analytics projections as the operational system of record

---

## 15. Rules for AI Agents

Before planning or changing Ranza, an AI agent must:

1. Read this blueprint and the active approved specification or issue.
2. Use the canonical domain language defined here.
3. Preserve the one-platform, no-forks model.
4. Identify the owning module for every business mutation.
5. Treat Subscription, Entitlement, configuration, permission, and Row-Level Security as separate gates.
6. Preserve Organization and Property isolation in schema, queries, services, tests, exports, jobs, and logs.
7. Design Turkish, English, Arabic, and RTL behavior with the feature—not afterward.
8. Use correction or reversal records when history matters.
9. Surface contradictions with approved architecture instead of silently overriding them.
10. Avoid inventing modules, workflows, pricing rules, legal policies, or integrations not approved by a specification.
11. Keep Prizic internal operations separate from Organization operations.
12. Prefer complete vertical slices with externally verifiable behavior.
13. Classify new code as a Prizic Platform Module, Ranza Domain Module, or host adapter before selecting its dependencies.
14. Keep reusable Platform Modules free of Ranza-specific language and models.
15. Avoid extracting a reusable package until a real second consumer proves the boundary.
16. Preserve database-enforced tenant isolation when choosing ORM roles, server operations, jobs, imports, and integrations.
17. Use synchronous commands for authoritative immediate results and reliable events for reactions; do not apply event-driven patterns indiscriminately.
18. Treat competitor patterns as research input, never as permission to copy protected expression or weaken Ranza's architecture.

When a requirement conflicts with this blueprint, the agent must stop and request a documented product or architecture decision.

---

## 16. Source-of-Truth Order

The recommended authority chain is:

1. `RANZA_PRODUCT_BLUEPRINT.md`
2. Approved architecture decision records
3. Approved module or release specifications
4. Active implementation issue or ticket
5. Code and automated tests

Version-specific engineering runbooks sit below approved architecture decisions. They may define current Prisma, Supabase, deployment, connection, migration, and operational procedures but must not silently change the product or security model.

Lower-level documents may add detail but must not silently contradict higher-level decisions.

---

## 17. Definition of Product Success

Ranza succeeds when an Organization can operate multiple Properties through one secure, localized, configurable system; purchase only the modules it needs; coordinate operational and back-office teams through reliable shared workflows; serve Guests and Residents effectively; and scale without customer-specific forks or fragmented data.

---

## 18. Product Experience Doctrine

### 18.1 Adoption before feature count

Ranza replaces established habits, spreadsheets, paper records, messaging groups, and disconnected software. A workflow is not successful merely because it exists in the product. It succeeds when the operating team trusts it enough to stop maintaining the previous record in parallel.

Every module must identify:

- The current workflow it replaces
- The trusted operational result it produces
- The role responsible for finalizing that result
- The fallback when a user does not participate
- The correction and reopen process
- The export or evidence required during transition
- The measurable adoption threshold for rollout success

### 18.2 One trusted operational state

Daily workflows should surface a small number of authoritative states rather than force staff to reconstruct truth from raw activity.

Examples include:

- Available, occupied, dirty, inspected, blocked, and out-of-order Accommodation Units
- Expected arrivals and departures
- Final kitchen or outlet counts
- Open and closed Folios
- Stock on hand and unresolved count differences
- Approved, received, invoiced, and exception purchase orders
- Open Guest requests and breached service targets

Where a cutoff or business-day close matters, Ranza records draft, finalized, corrected, reopened, and superseded states explicitly. Finalization freezes the operational snapshot; later changes require authority, reason, and audit history.

### 18.3 Progressive complexity

Default screens serve new or occasional users with the fewest decisions required to complete the task. Expert users gain density through saved views, keyboard shortcuts, customizable panels, bulk actions, and drill-down without forcing that complexity on everyone.

Destructive, financial, privacy-sensitive, and high-impact actions remain explicit. Speed must not remove confirmation, reason capture, conflict detection, or permission checks where they are required.

### 18.4 Dashboard to action

Dashboards are operational entry points, not decorative analytics collections. Every metric or exception card must open the filtered records and primary action that explain or resolve it.

The Operator home screen should prioritize:

- Arrivals, departures, and in-house Guests
- Accommodation Unit readiness and exceptions
- Unresolved Guest or Resident requests
- Housekeeping and maintenance blockers
- Revenue and occupancy snapshot
- Inventory risks
- Pending approvals
- Integration or synchronization failures
- Shift handover notes

### 18.5 Status communication

Status must never rely on color alone. Every state combines color with text, iconography, shape, or position. Status vocabulary is shared across desktop, tablet, mobile, exports, notifications, and audit records.

### 18.6 Reservation workspace

Reservations use a timeline or calendar as the primary operational view with day, week, and appropriate longer-range modes. The workspace includes:

- Filters by Property, Accommodation Unit type, state, channel, group, and assignment status
- Drag-and-drop only when all business rules permit the move
- Conflict preview before changing dates or units
- A persistent side drawer containing Guest, Reservation, Stay, Accommodation Unit, Folio, notes, communications, and tasks
- A prominent action cluster for confirm, assign, check in, move, extend, cancel, no-show, and check out
- Alternative dates, unit types, and Properties when the requested allocation is unavailable
- Saved views for recurring front-desk and revenue workflows

### 18.7 Guest 360

One governed Guest workspace provides:

- Identity and contact facts
- Current and previous Reservations and Stays
- Preferences and accessibility needs
- Communications and delivery state
- Requests, incidents, and recovery actions
- Folios, invoices, credits, and payment records
- Loyalty membership where entitled
- Consent, privacy, retention, and anonymization state
- Internal notes with explicit visibility levels

Duplicate detection may suggest candidate matches but must not merge ambiguous people automatically. Authorized staff review the evidence, choose the survivor record, preview the impact, and produce an audit record.

### 18.8 Mobile operational design

Mobile work modes are task-first rather than compressed desktop dashboards. The current assignment, location, priority, required evidence, primary state transition, and next task should be reachable with minimal navigation.

Selective offline support may be added for operations that can define safe local validation, an encrypted queue, idempotent synchronization, conflict resolution, expiry, and visible failure recovery. Ranza must not promise universal offline operation across the ERP.

### 18.9 Guest and Resident journey

The Portal may guide an entitled user through:

1. Booking or activation
2. Pre-arrival information and registration
3. Consent and required forms
4. Arrival or check-in instructions
5. In-stay or in-residence services
6. Requests, announcements, acknowledgments, and communication
7. Eligible purchases or upsells
8. Folio or balance review
9. Checkout, departure, or transfer
10. Feedback and future relationship preferences

The journey remains branded, mobile-first, accessible, localized, and consistent across web, email, and approved messaging channels.

---

## 19. Migration, Onboarding, and Adoption

### 19.1 Data import

CSV and spreadsheet import is a product workflow, not a one-off support script. Every import includes template guidance, field mapping, locale-aware parsing, validation, duplicate detection, a preview, row-level errors, an explicit commit, an audit record, and a downloadable result report.

Large imports require idempotency, resumability where appropriate, and safe reconciliation. An import must never silently overwrite trusted operational records.

### 19.2 Guided setup

Organization onboarding should progressively establish:

1. Organization identity and regional settings
2. Properties, buildings, floors, Accommodation Units, outlets, and stores
3. Roles, Staff assignments, and privileged access
4. Branding, domains, languages, and communications
5. Entitlements and supported Feature Configuration
6. Operational cutoffs, business date, taxes, accounting, and document settings
7. Data import and reconciliation
8. Integrations and failure testing
9. Training workflows and go-live approval

Readiness is visible as a checklist with owners, evidence, blockers, and audit history.

### 19.3 Parallel operation

For high-risk workflows, an Organization may temporarily run Ranza beside the previous process. The comparison period has a defined start, end, reconciliation method, success threshold, and decision owner. Parallel operation must not become permanent duplicate work.

Exports, printable operational snapshots, and scheduled digests may support transition, legal evidence, and continuity. They should be generated from Ranza's authoritative records rather than maintained separately.

### 19.4 Manual fallback and correction

Self-service failure must not make the operational record unusable. Authorized Staff can complete or correct required actions with a captured source, reason, actor, and time. Ranza distinguishes user-submitted, staff-entered, imported, automated, and integration-originated facts.

### 19.5 Notifications and digests

Notifications should be derived from operational need, urgency, user preference, consent, and quiet-hour rules. The product supports immediate alerts for time-sensitive exceptions and compact scheduled digests for managerial awareness.

Delivery, opening, and acknowledgment are different facts. Ranza must not describe a delivered or opened message as understood or legally accepted.

### 19.6 Adoption measures

Each rollout defines measurable targets such as:

- Percentage of eligible activity completed in Ranza
- Percentage completed before operational cutoff
- Number and cause of Staff overrides
- Difference between Ranza totals and reconciled external evidence
- Time required to complete the workflow
- Number of unresolved critical data errors
- Whether the previous process was retired by the approved date
- Training completion and support demand by role

Product analytics must measure workflow health without becoming employee surveillance or collecting unnecessary personal data.

---

## 20. Competitor Patterns to Adapt and Learn From

Competitor research informs product decisions but does not authorize copying proprietary layouts, branding, labels, source code, or screen flows. Ranza adapts proven interaction principles to its own domain model, design system, and operating strategy.

### 20.1 Mews

[Mews](https://www.mews.com/en/property-management-system) demonstrates a connected hospitality workspace spanning Reservations, housekeeping, Guest journeys, payments, and integrations. Its useful patterns include a centralized Reservation timeline, compact contextual detail, digital Guest journeys, deduplicated Guest profiles, mobile operations, and bookable non-room resources.

Ranza should learn from:

- Timeline-first Reservation operations
- Contextual detail without repeated full-page navigation
- Strong Guest self-service and pre-arrival journeys
- A meaningful operational core with substantial extensions sold separately
- Bookable spaces and services beyond Accommodation Units

Ranza must retain stricter module ownership, explicit tenant isolation, and its own terminology and interaction design.

### 20.2 Cloudbeds

[Cloudbeds](https://www.cloudbeds.com/hotel-management-software/) groups its platform around operational jobs such as Operations, Distribution, Guest Experience, and Revenue rather than presenting an undifferentiated ERP list. Its public packaging supports both an integrated stack and connected external tools; its pricing structure expands from core operations into Guest experience, revenue, and enterprise capabilities. See [Cloudbeds pricing](https://www.cloudbeds.com/pricing/).

Ranza should learn from:

- Job-based navigation
- Flexible plan and add-on packaging
- Customizable operating dashboards
- Drag-and-drop planning with rule validation
- Multi-Property consolidated views
- An integration marketplace alongside native modules

### 20.3 Oracle OPERA Cloud

[Oracle OPERA Cloud](https://www.oracle.com/hospitality/hotel-property-management/hotel-pms-software/) demonstrates configurable, information-dense workflows for complex Properties. Public product information highlights configurable dashboard tiles, mobile-enabled operations, multiple Reservation views, drill-down actions, and open integration services.

Ranza should learn from:

- User-, Property-, and Organization-scoped dashboard configuration
- Dense expert workspaces that remain action-oriented
- Direct drill-down from operational metrics
- Alternative date, rate, unit, or Property suggestions
- Group-wide reporting and centralized controls
- Lightweight service modes for Properties that do not need a full module

Ranza must reserve high density for expert views instead of making every default screen resemble legacy enterprise software.

### 20.4 Apaleo

[Apaleo](https://apaleo.com/) positions its hospitality platform around an open PMS, open APIs, payments, and an application store. Its [Open APIs](https://apaleo.com/open-apis) and [Apaleo Store](https://apaleo.com/apaleo-store) demonstrate how an ecosystem can extend operations without requiring a source-code fork.

Ranza should learn from:

- Publicly governed APIs and webhooks
- Plug-and-play integrations
- An integration catalog organized by operational outcome
- Embedded extension surfaces where safe
- Clear separation between platform foundation and optional ecosystem capabilities

Ranza should define internal contracts, webhooks, and extension governance early even if a public marketplace is deferred.

### 20.5 Odoo

[Odoo](https://www.odoo.com/) demonstrates how focused ERP applications can share business records while remaining recognizable workspaces. Its Inventory, Purchase, Accounting, HR, and Restaurant POS products illustrate connected domain breadth; its POS documentation also provides a useful benchmark for selective offline operation.

Ranza should learn from:

- Focused module workspaces rather than one enormous interface
- Reusable generic business capabilities
- End-to-end Inventory and Procurement flow
- Connected operational and accounting records
- Selective offline support where the workflow can reconcile safely

Ranza deliberately uses stricter ownership than Odoo-style model inheritance: modules communicate through contracts rather than freely extending or mutating each other's models.

### 20.6 ElektraWeb and Protel in Turkey

[ElektraWeb](https://www.elektraweb.com/en) demonstrates demand in Turkey for a broad cloud hospitality platform combining front office, accounting, POS, Guest applications, stock, CRM, and local operational needs. [Protel](https://www.protel.com.tr/en/hotel-management-solutions/) demonstrates the importance of Turkish hospitality integrations, mobile operations, kiosks, channel management, restaurant systems, reporting, and local professional support.

Ranza should learn from:

- Turkey-specific fiscal and hospitality integrations
- A credible implementation and support model
- Mobile access for staff throughout the Property
- Connected PMS, POS, stock, accounting, and Guest operations
- Local-language training and operational documentation

Ranza should differentiate through simpler adoption, modern role-based experiences, transparent module boundaries, strong white-label configuration, and a lower learning burden for independent operators.

### 20.7 Competitive synthesis

Ranza's intended product direction is:

> Mews' operational simplicity, Cloudbeds' packaging flexibility, OPERA's expert drill-down, Apaleo's openness, Odoo's connected ERP breadth, and Turkey-specific localization expressed through Ranza's own architecture and design system.

This synthesis produces the following required capabilities:

1. Role-based home dashboards with drill-through actions.
2. Reservation timeline with persistent contextual detail.
3. Guest 360 with controlled duplicate resolution.
4. Cross-department tasks and shift handover.
5. Mobile housekeeping, maintenance, F&B, Inventory, and Manager modes.
6. Bookable non-room resources.
7. Digital pre-arrival and check-in journeys.
8. Lifecycle-based upsells.
9. Multi-Property consolidated views.
10. Saved views, configurable dashboards, and scheduled exports.
11. An integration catalog, webhooks, and governed embedded extensions.
12. Selective offline queues for proven operational needs.
13. Explicit plan, bundle, and add-on packaging.
14. A lightweight POS mode for Properties without full F&B operations.
15. Loyalty as an optional Entitlement.

### 20.8 Patterns Ranza must not copy

Ranza must not:

- Reproduce competitor layouts, wording, visual styling, or workflows screen-for-screen
- Expose every ERP module in one overwhelming sidebar
- Make an ecosystem-critical API available only through the highest commercial tier
- Force every Organization into one monolithic package
- Promise universal offline behavior
- Import enterprise density into novice screens
- Let third-party extensions bypass Entitlements, permissions, audit, or tenant isolation
- Trade module ownership for short-term integration convenience
