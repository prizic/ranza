# 0011. Module anatomy is earned, and a version starts at publication

Status: Accepted
Date: 2026-09-16

## Context

Two conventions live in `packages/` and nothing says which is right.

`packages/platform/audit` has the full anatomy blueprint 9.10 describes:
`domain/`, `application/`, `infrastructure/`, and a public `index.ts`.
`packages/auth`, `packages/ranza/core` and `packages/ranza/stays` are flat —
`contracts.ts`, `module.ts`, `ports.ts`, `index.ts`. Both pass the boundary
rules, because the rule those enforce is the same either way: an importer
reaches `index.ts` and nothing else.

Section 9.10 also asks each reusable module for "documentation, a changelog, and
an upgrade path", and 9.16 says "internal packages follow Semantic Versioning".
Every package here is `private: true` at `0.0.0`, every dependency is
`workspace:*`, and no package has a changelog.

Left alone this becomes precedent by accident: the next module copies whichever
neighbour its author opened first.

## Decision

### The layered shape is adopted where it makes a checkable claim

`domain/`, `application/` and `infrastructure/` are not decoration. They exist
so `.dependency-cruiser.cjs` can enforce `domain-layer-is-framework-independent`
— that a module's rules do not reach for Next or Prisma. That claim is worth
making when there are rules to make it about.

**`packages/platform/*` uses the full anatomy.** A reusable module has to survive
being pointed at another host's database, so its invariants must live in
TypeScript, where they travel. `audit/domain/record.ts` is that.

**`packages/ranza/*` stays flat until it has a rule that SQL cannot hold.** This
is not laziness, it is where this product deliberately puts its invariants: a
Unit cannot belong to another Organization's Property because of a composite
foreign key; a Resident reaches only their own Stay because of a policy; a
capacity of zero is unrepresentable because of a check constraint. Row-level
security is the authorization boundary rather than a backstop (blueprint 7.1),
and a `domain/` directory re-stating those rules in TypeScript would be a second,
weaker copy that an application defect could skip. When a Ranza module gains a
rule the database genuinely cannot express — a rate calculation, a cancellation
policy — it earns the layers then.

**`packages/{auth,config,db,i18n,observability,ui}` are not modules under 9.10.**
They are the cross-cutting infrastructure section 9.2 lists separately. They take
dependencies by injection (ADR 0006) and expose `index.ts`, and that is all that
is asked of them.

### A version is a promise, and there is nobody to promise it to

Semantic Versioning coordinates a producer with a consumer that can lag behind
it. Every package here is private, every dependency is `workspace:*`, and every
consumer is rebuilt from the same commit. A version number would move without
ever constraining anything, which is worse than no version: it reads as a
guarantee that was never checked.

**Packages stay at `0.0.0` while they are workspace-pinned and unpublished.**
Real versioning begins at the first publication to a registry, which blueprint
9.9 and the platform tier README already gate on a second real product needing
the module. That is the moment a consumer can lag, and the moment SemVer starts
meaning something.

**Changelogs start now.** They are the half of 9.10 item 7 that is useful
immediately and impossible to reconstruct later. A module is the unit of
extraction, so its changelog is what a future consumer reads first. Entries are
written under `Unreleased` as the work happens, and `scripts/docs-check.mjs`
fails the build when a module has no `CHANGELOG.md` — the same treatment
READMEs already get, because a reminder that depends on memory is not one.

## Consequences

Adding a module means answering one question rather than copying a neighbour:
does it carry a rule that has to travel, or is its rule a constraint in the
database? Platform modules answer the first way by construction.

This ADR reads 9.16 narrowly, and says so: "internal packages follow Semantic
Versioning" is taken as a rule about published artefacts rather than about
directories in one repository. If a package is ever consumed at a version by
something that does not move with this commit, that reading is wrong and this
decision needs amending before the package ships.

A changelog that nobody writes is worse than none, because it looks like a
record. The build check makes the file exist; only review makes it true.
