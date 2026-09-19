# `@ranza/staff`

## Unreleased

- The roster and reach: memberships, roles, Property assignments and
  invitations, with the write policies, column grants and triggers that bound
  them.
- The permission catalogue, and the fifth gate it put inside every write policy
  the product already had ([ADR 0012](../../../docs/adr/0012-a-write-is-bounded-by-a-policy-not-a-check.md)
  is amended rather than contradicted).
- An Organization composes roles of its own, bounded by what their author
  already holds.
- A reach change ends every session that Staff Member holds, through the
  outbox and one function across the credential boundary (ADR 0027).
