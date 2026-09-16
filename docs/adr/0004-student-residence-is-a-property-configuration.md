# 0004. Student residence is a Property configuration, not a product

Status: Accepted
Date: 2026-09-16

## Context

Ranza began as a student-dormitory product with its own domain model — Dormitory
Operator, Branch, Student — now archived at `v0-pilot-archive`. A dormitory operator
remains a live prospect with no committed date.

The blueprint treats student accommodation as one supported case among hotels,
hostels, serviced residences, and staff housing. Section 2 defines Student as a
supported Resident type; section 14 forbids duplicating the platform into separate
hotel, hostel, or residence products.

## Decision

Student residence is served by configuration of the general model, never by a fork
or a parallel model.

- A dormitory is a Property whose configuration selects long-stay Resident behavior.
- A Student is a Resident associated with a Stay, not a top-level identity.
- Dormitory workflows — nightly attendance declarations, meal selections,
  announcement acknowledgment, resident balances — are entitled capabilities of
  Guest and Resident Services, built on Stays like every other operational module.

The pilot's activation-code and PIN credentials become one supported Resident
authentication method among several, not the identity model.

## Consequences

The dormitory prospect cannot be served before Properties, Accommodation Units, and
Stays exist, because its workflows now depend on them. This is accepted: rebuilding
those workflows against a fork would recreate the failure this rebuild exists to
correct.

No schema, route, or package may be introduced whose justification is that
dormitories are special. If a genuine dormitory requirement cannot be expressed as
configuration, that is a blueprint gap and needs a new ADR, not a workaround.
