/**
 * The ranza-reviewer read-only hook, run the way Claude Code runs it.
 *
 * The agent file grants `Bash` and promises never to widen a grant, drop a
 * policy, edit a migration or move the branch. That promise used to live only
 * in prose beside a tool that can do all four. This is what makes it a
 * refusal — and this test is what stops the refusal from becoming prose in its
 * turn, because `.claude/settings.json` is ECC-owned and gitignored, so the
 * registration cannot be reviewed here and the script can.
 *
 * Spawned as a child process rather than imported. The exit code is the whole
 * interface — 2 blocks the call, 0 allows it — and an imported function has no
 * exit code, so importing would test something Claude Code never runs.
 *
 * The payload shape is not invented. It was captured from a live PreToolUse
 * hook: `agent_type` is present for a subagent and absent on the main thread,
 * which is what makes scoping possible at all.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const HOOK = join(process.cwd(), "scripts/hooks/reviewer-read-only.mjs");

function run(command: string, agentType: string | null = "ranza-reviewer") {
  const payload: Record<string, unknown> = {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command },
  };
  if (agentType !== null) payload.agent_type = agentType;

  const result = spawnSync("node", [HOOK], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  return { status: result.status, stderr: result.stderr };
}

/** The four the agent file names, plus the ones the finding named. */
const REFUSED = [
  ["git commit", 'git commit -m "fixed it"'],
  ["git push", "git push -u origin chore/review-rules"],
  ["git checkout", "git checkout -- packages/ranza/guests/src/module.ts"],
  ["an in-place edit", "sed -i '' 's/in_house/departed/' module.ts"],
  [
    "granting a privilege",
    `psql "$DIRECT_URL" -c "grant update on guests to ranza_app"`,
  ],
  [
    "dropping a policy",
    `psql "$DIRECT_URL" -c "drop policy guests_read_own_organization on guests"`,
  ],
  [
    "a second statement after a read",
    `psql "$DIRECT_URL" -c "select 1; drop table guests"`,
  ],
  ["a redirection", "git diff main...HEAD > /tmp/review.txt"],
  ["an append", "echo finding >> notes.md"],
  ["tee", "git log --oneline | tee /tmp/log.txt"],
  ["removing a file", "rm prisma/migrations/20260916002600_x/migration.sql"],
  ["a migration command", "pnpm prisma migrate deploy"],
] as const;

/** What a review actually does, none of which may be blocked. */
const ALLOWED = [
  "git diff main...HEAD",
  "git log --oneline -20",
  "git show 09f8bc4 --stat",
  "git status --short",
  "grep -rn 'guest_stay_summary' prisma/migrations",
  "cat docs/features/residents-and-guests/edge-cases.csv",
  `psql "$DIRECT_URL" -c "select polname, qual from pg_policies where tablename = 'guests'"`,
  `psql "$DIRECT_URL" -c "select proacl from pg_proc where proname = 'guest_stay_summary'"`,
  "node scripts/db-test.mjs",
  "pnpm check",
  "git diff main...HEAD | head -100",
  "ls -la packages/ranza/guests/src > /dev/null",
] as const;

describe("the reviewer cannot write, and not only promises not to", () => {
  it.each(REFUSED)("refuses %s", (_label, command) => {
    const { status, stderr } = run(command);
    expect(status).toBe(2);
    expect(stderr).toContain("reviews without changing anything");
  });

  it.each(ALLOWED)("allows %s", (command) => {
    expect(run(command).status).toBe(0);
  });

  it("refuses nothing on the main thread, where a person is typing", () => {
    // agent_type absent is what Claude Code sends outside a subagent. Without
    // this the hook would block the author's own commits, which is a different
    // bug and a worse one.
    for (const [, command] of REFUSED) {
      expect(run(command, null).status).toBe(0);
    }
  });

  it("refuses nothing in another subagent", () => {
    expect(run('git commit -m "x"', "general-purpose").status).toBe(0);
  });

  it("does not become a way through when its input is not JSON", () => {
    const result = spawnSync("node", [HOOK], {
      input: "not json",
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
  });
});
