---
name: ranza-review
description: Review a Ranza branch against its approved edge-case rows and the CLAUDE.md testing rules. Use before proposing a push, or when deciding whether a slice is done. Runs the ranza-reviewer subagent, which is read-only.
---

# Ranza review

Run the `ranza-reviewer` subagent. The standard it reviews against, and what it
will not do, are in `.claude/agents/ranza-reviewer.md`; this file does not
restate them, because a launcher that carries its own copy of the standard is
the duplication that moving the rules into `AGENTS.md` was meant to end.

## Before a push

`CLAUDE.md` and the house rule both require the diff to be reviewed before a
push is proposed, and a push is its own approval gate regardless of what was
approved before it.

## What enforces the read-only part

`scripts/hooks/reviewer-read-only.mjs`, a PreToolUse hook scoped by
`agent_type`, and `tests/unit/reviewer-read-only.test.ts`. The agent holds
`Bash`, so the promise had to become a refusal — see the header of that script
for what it does and does not cover.

It has to be registered in `.claude/settings.json`, which is ECC-owned and
gitignored, so a fresh clone has the script and not the wiring:

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "id": "ranza-reviewer-read-only",
      "command": "node scripts/hooks/reviewer-read-only.mjs"
    }
  ]
}
```

ECC merges rather than replaces and will not remove an entry it did not
install, so this survives the next install — read in `mergeManagedHooks`.
