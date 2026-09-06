# Domain Documentation

Ranza currently uses one system-wide domain context.

Before exploring or changing the codebase:

1. Read `CONTEXT.md` and use its exact domain terms.
2. Read the relevant records in `docs/adr/`.
3. Read `docs/specs/ranza-pilot.md` and the active GitHub issue.
4. Surface any contradiction with an ADR instead of silently overriding it.

Do not introduce customer-specific fork terminology or use the glossary's avoided synonyms. If the monorepo later develops genuinely independent bounded contexts, introduce `CONTEXT-MAP.md` through an explicit domain-modeling decision rather than creating package-local glossaries ad hoc.
