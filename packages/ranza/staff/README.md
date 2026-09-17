# `@ranza/staff`

Who works for an Organization, what they may do, and which Properties they
reach.

A **role is a named set of permissions**, not a label. Ranza ships a fixed set
of roles every Organization shares and none may edit; an Organization may author
its own, and the moment a new set of permissions is wanted it is a new role with
a name (blueprint 7.2).

## The rules are in the database

Nothing in `module.ts` asks whether the actor is allowed. That is deliberate and
it matters more here than anywhere else in the product: the subject of these
writes _is_ authorization, so a check this module made and the database did not
would be a check somebody can route around by reaching the table another way.

| Rule                                             | Where it lives                                                  |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Another Organization's role is unrepresentable   | composite foreign key `(role_scope_id, role)`                   |
| One person, one membership per Organization      | `organization_memberships_organization_id_user_id_key`          |
| Only an administrator writes any of this         | the insert and update policies                                  |
| Money never blocks taking reach away             | the `status = 'revoked'` branch in those policies' `WITH CHECK` |
| Which columns an administrator may change        | column grants, not a policy — a policy bounds rows              |
| An Organization keeps somebody who can add staff | `organization_memberships_keep_an_administrator`, which locks   |
| The undo window                                  | the `revoked_at >` predicate in the statement itself            |

## What it deliberately cannot do

End a session. `ranza_app` is granted nothing on `auth_session` and `ranza_auth`
is what reaches it (ADR 0005). Every command that changes reach publishes
`staff.reach_changed` inside the same transaction, so the fact is durable while
the handler that acts on it is still being built (ADR 0017, ADR 0020).

Send the invitation. There is no Notifications module (blueprint 5.12), so
`invite()` returns the token once and a person passes it on. Only its SHA-256
digest is stored.

## Design

`docs/features/staff-and-permissions/` — the diagrams and the row-per-boundary
table that every object above points back at.
