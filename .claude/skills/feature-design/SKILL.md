---
name: feature-design
description: Design one Ranza feature before any code is written, as two or three Mermaid diagrams and one CSV. Use when starting a new feature, or when the user says "design <feature>", "feature-design", or asks to design a workflow before implementing it.
---

# Feature design

Code comes last. A feature is designed as diagrams and one table, approved a step at a
time, before a line of it is written. This skill does not write application code,
migrations or tests. Step f hands that to `tdd`.

Use the vocabulary AGENTS.md binds: Organization, Property, Resident, Stay, Guest. The
pilot words — Operator, Branch, Student, tenant — are bugs wherever they appear.

## Output

Exactly this, per feature, and nothing else:

```
docs/features/<feature>/use-case.mmd
docs/features/<feature>/states.mmd
docs/features/<feature>/edge-cases.csv
docs/features/<feature>/sequence.mmd    only when three or more modules or applications take part
```

**Forbidden**: any extra `.md`, any summary, any handover document, any prose that
explains a diagram. The diagrams and the CSV are the documentation. A `%%` comment
inside a `.mmd` is allowed for one purpose only — flagging an open question.

## Steps

Each step ends at a stop: show the file, wait for the user's explicit approval, do not
begin the next step. An unanswered question is never filled in to keep moving.

### a. Grill

Call the Skill tool with `grilling`. Three rules override it:

1. **One question at a time**, not a whole frontier per round. Wait for the answer.
2. **No recommended answer before the user answers.** Upstream `grilling` attaches a
   recommendation to every question; here that biases the answer you are trying to
   elicit. Ask the question bare. _After_ the user has answered, you may offer your
   recommendation as a second opinion — the user decides whether to change their answer.
3. **No sub-agents and no reading code during the grill.** The only sources you may
   consult are `docs/RANZA_PRODUCT_BLUEPRINT.md` and `docs/adr/`. A question that needs a
   fact from the code is recorded as an open question and left; the grill is about how
   the business should work, not about what is currently implemented.

- The user answers. The agent never answers for the user, and never offers an answer as
  a fait accompli it then builds on.
- "I don't know" is recorded as an open question. It is not resolved by inference.

The grill is not finished until all of these are covered:

|                 |                                                         |
| --------------- | ------------------------------------------------------- |
| actors          | who acts, and on whose behalf                           |
| goal            | what is true afterwards that was not true before        |
| preconditions   | what must already hold for the main flow to start       |
| main flow       | the path when nothing goes wrong                        |
| **TIME**        | early, late, same day, last day, past midnight          |
| **CONCURRENCY** | two people or two processes doing it at once            |
| **MONEY**       | charges, refunds, unpaid balances                       |
| **ACCESS**      | wrong Organization, wrong Property, lapsed subscription |
| **REVERSAL**    | the mistake, and how it is undone                       |

### b. `use-case.mmd`

A Mermaid **`flowchart`**, with actors and use cases as nodes. Every alternative flow
the grill produced appears in it. No unresolved question may be drawn as resolved — mark
it with a `%%` comment naming the open question.

Mermaid's real use case diagram, `usecase-beta`, is **not** used. It arrived in Mermaid
12.0.0 and GitHub has not been confirmed to render it; a diagram that does not draw on
GitHub is not documentation. Switch to `usecase-beta` only once someone has checked
GitHub's version (paste a fenced `mermaid` block containing `info` into a draft comment)
and it reads 12 or higher.

### c. `states.mmd`

A Mermaid `stateDiagram-v2`. Every allowed transition is an arrow **labelled with the
command that causes it**. Anything not drawn is forbidden. Terminal states are marked
(`--> [*]`).

### d. `edge-cases.csv`

Header, exactly:

```
id,situation,given,when,then,enforced_by,test_name,status
```

- `enforced_by` is one of `database_constraint`, `policy`, `trigger`, `module`,
  `ui_only`. **`ui_only` is never acceptable for a business rule** — if that is the only
  answer available, the rule is unenforced and the row stays `open`.
- One row per boundary. Every arrow in `states.mmd` has at least one row. Every
  alternative flow in `use-case.mmd` has at least one row.
- `test_name` is the name of the test that will be written first in step f.
- `status` is `open` until the user approves that row.
- Quote any field containing a comma.

### e. Consistency check

List, and nothing else:

1. every transition in `states.mmd` with no row in the CSV
2. every row that contradicts a diagram
3. every open question still outstanding

Fix what can be fixed, ask about what cannot. The design is **ready** only when that
list is empty.

### f. Implementation

Only now. Call the Skill tool with `tdd`, and write the failing tests named in
`test_name` first.
