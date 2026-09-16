# Roadmap

Every bullet of blueprint section 13, and whether it is built. One page, so
"where are we" has an answer that does not require reading the whole repository.

**This file states status and nothing else.** It points at the thing that proves
each claim — a module, a migration, a suite, an ADR — rather than restating what
those say, because a document that copies facts is a document that goes stale.
Where it and the blueprint disagree, the blueprint wins.

Update it in the same commit that changes a state. `pnpm check` cannot tell you
this file is wrong.

|             |                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| **done**    | Built, and proved by something you can run                                                                        |
| **partial** | Some of the bullet stands; the rest is named                                                                      |
| —           | Not started. Often on purpose: blueprint section 13 forbids building tables ahead of the workflows that need them |

## Right now

Phase 1 is mostly standing, Phase 2 has three of its bullets. The Folio landed,
so Finance has a screen and Analytics has somewhere to read revenue from. The
next structural piece is a **Guest**: a Reservation carries a `guest_name`
string, and a Folio now needs somebody to bill.

Per-screen notes for the Operator Workspace are in
[`handover/operator-workspace-screens.md`](handover/operator-workspace-screens.md).

## Phase 1 — Platform foundation

| Bullet                                                           |             | Evidence, or what is missing                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Organization and Property model                                  | **done**    | `20260916000100_organization_property_foundation`, `packages/ranza/core`, `tests/database/organization_property_foundation.test.sql`                                                                                                                                                             |
| Identity, roles, assignments, and MFA                            | **done**    | `packages/auth`, migrations `…000200`, `…000600`, `…000800`; [ADR 0005](adr/0005-better-auth-with-provider-indirection.md), [ADR 0010](adr/0010-a-second-factor-belongs-to-the-person.md)                                                                                                        |
| Entitlements and Feature Configuration                           | **partial** | `entitlements` and `property_capabilities` exist and gate every screen. Feature Configuration beyond on/off — values at Organization, Property, department or outlet scope (blueprint 2) — is not built                                                                                          |
| White-label tokens and domains                                   | —           | Nothing. Blueprint 2 and 7 specify it                                                                                                                                                                                                                                                            |
| Localization and RTL                                             | **done**    | `packages/i18n`, three locales, `dir` on `<html>`, logical utilities throughout                                                                                                                                                                                                                  |
| Audit, observability, notifications, data lifecycle              | **partial** | Audit done: `packages/platform/audit`, append-only by trigger, [ADR 0008](adr/0008-a-module-owns-a-schema-not-a-migration-history.md). Observability is a stub. Notifications and data lifecycle are not built                                                                                   |
| Storefront, Operator Workspace, Portal shell, Control Plane      | **partial** | Workspace and Portal are real, and `apps/worker` runs alongside them — NestJS as a standalone context, no HTTP ([ADR 0016](adr/0016-a-long-running-process-is-a-worker-not-a-second-backend.md)). `apps/storefront` and `apps/control-plane` are empty directories                               |
| Bounded-context rules and public module contracts                | **done**    | `.dependency-cruiser.cjs` and `scripts/dependency-boundaries.mjs`, each with fixtures proving they fail when violated                                                                                                                                                                            |
| Runtime roles, RLS verification, pooled and direct connections   | **done**    | `ranza_app` / `ranza_auth` / `ranza_worker`, [ADR 0001](adr/0001-prisma-owns-schema-sql-owns-rls.md), [ADR 0018](adr/0018-the-worker-has-its-own-role-and-its-own-context.md), the pgTAP suites                                                                                                  |
| Generic notification, audit, file, task, integration foundations | **partial** | Audit and the outbox: `packages/platform/audit`, `packages/platform/outbox`, [ADR 0017](adr/0017-cross-module-facts-travel-through-a-transactional-outbox.md). Notifications, files and tasks are not built — the outbox is what they will be delivered through, not a delivery mechanism itself |

## Phase 2 — Accommodation operations

| Bullet                                                            |             | Evidence, or what is missing                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Property structure and Accommodation Units                        | **done**    | `20260916000400_accommodation_units`, `packages/ranza/accommodation`                                                                                                                                                                                                                                                                         |
| Reservations, availability, Stays, check-in, check-out, transfers | **partial** | All but transfers. `packages/ranza/reservations`, migrations `…000900`–`…001100`, [ADR 0012](adr/0012-a-write-is-bounded-by-a-policy-not-a-check.md). Availability is an exclusion constraint, not a query. **Transfers — room moves — are refused by a column-level grant**, so building them is a deliberate act rather than a side effect |
| Housekeeping room-status lifecycle                                | —           | `accommodation_units.status` allows three states; blueprint 18.2 names six. Check-out is the natural trigger for "dirty" and deliberately does not fire it                                                                                                                                                                                   |
| Folio foundation                                                  | **done**    | `20260916001200_folios`, `packages/ranza/folios`, [ADR 0015](adr/0015-money-is-an-integer-a-balance-is-a-sum-and-a-correction-is-a-line.md). A Folio, a line, a balance that is only ever their sum, a reversal, and closing. Payments, taxes, discounts, deposits, refunds and split folios are blueprint 5.9 and are not built             |
| Guest and Resident profiles                                       | —           | **The next structural piece.** A Reservation carries a `guest_name` string and a Folio bills it. There is no Guest record                                                                                                                                                                                                                    |
| Reservation timeline, command center, Guest 360                   | —           | Blueprint 18.6 specifies the timeline in detail: filters, conflict preview, a side drawer, an action cluster                                                                                                                                                                                                                                 |
| Guided import, setup, training, rollout evidence                  | —           | Blueprint 18.1 ties this to adoption rather than feature count                                                                                                                                                                                                                                                                               |

## Phase 3 — Operational services

Not started. Guest and Resident services · F&B and meal workflows · Maintenance
and facilities · Inventory movements and stock control · Procurement through
receiving.

The reusable halves — inventory, procurement — belong in `packages/platform/`
with a host adapter, because a platform module may not name a Property or a Stay
(blueprint 9.8).

## Phase 4 — Back-office ERP

Not started. Accounts receivable and payable · General ledger and financial
close · HR and payroll · CRM and communication workflows · Cross-module
analytics.

## Phase 5 — Ecosystem and optimization

Not started. External payments · Channel and distribution integrations · Door
locks and specialized devices · Advanced forecasting and revenue optimization ·
Native applications only where validated · Public APIs, webhooks, integration
catalog · Reusable Platform Module publication **only when a second real product
requires it** (blueprint 9.9).

## Decisions not yet applied

Agreed, recorded, and still outstanding. Each is a thing the code does not do
yet, so neither the ADR nor this row is a lie.

|                                                                            |                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [ADR 0014](adr/0014-an-application-is-flat-and-its-imports-are-aliased.md) | Applications lose `src/` and import through `@/`. Every new route deepens the climb it describes |
| [ADR 0010](adr/0010-a-second-factor-belongs-to-the-person.md), amended     | Nothing can yet _require_ MFA, and there is no operator-assisted reset for a lost authenticator  |
| `docs/design/visual-reference.md`                                          | The palette wins over the current theme where they disagree; they still disagree in places       |

## How a slice gets planned

Not per phase. A phase is months of work, and a plan at that size is stale
before anyone reads it — which is the same reason blueprint section 13 asks for
vertical slices rather than a schema built up front.

Plan at the slice. One slice is: a module that owns its tables, its policies
with **each boundary broken and watched going red**, the read through the server
funnel, the screen, and the gate that reveals it. The five steps are written out
in [`handover/operator-workspace-screens.md`](handover/operator-workspace-screens.md),
with arrivals and departures as the worked example.

This file is the map, not the plan. It answers "where am I"; the slice plan
answers "what do I do next", and it is thrown away when the slice lands.
