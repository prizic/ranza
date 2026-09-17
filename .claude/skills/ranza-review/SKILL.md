---
name: ranza-review
description: Review a Ranza branch against its approved edge-case rows and the CLAUDE.md testing rules. Use before proposing a push, or when deciding whether a slice is done. Runs the ranza-reviewer subagent, which is read-only.
---

# Ranza review

A review here is not a style pass. The repository's tests are mostly assertions
that a boundary holds, and three of them have already turned out to verify
nothing — a runner that matched the wrong string, a role nothing connected as,
a policy set that was correct and completely inert. So the standard is not
"there is a test" but "that test could fail".

Run the `ranza-reviewer` subagent. It reads `CLAUDE.md`, the feature's
`edge-cases.csv` and the branch diff, and reports findings against the approved
rows. It has read-only tools by design: a reviewer that fixes what it finds
leaves nobody having read the finding.

## Before a push

`CLAUDE.md` and the house rule both require the diff to be reviewed before a
push is proposed, and a push is its own approval gate regardless of what was
approved before it.

## What it will not do

It will not widen a grant, drop a policy or edit a migration to test a claim.
If verifying a finding needs a sabotage, it names the sabotage and the author
runs it — because the author is the one who has to see it go red.
