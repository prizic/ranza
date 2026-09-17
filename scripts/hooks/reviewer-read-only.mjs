// The reviewer's read-only promise, enforced instead of described.
//
// `.claude/agents/ranza-reviewer.md` grants `Bash` and promises never to widen
// a grant, drop a policy, edit a migration or change the branch. Prose is not
// an enforcement mechanism: `sed -i`, `git commit` and `psql -c "grant ..."`
// are all one Bash call away. This is a PreToolUse hook that refuses them.
//
// It is scoped by `agent_type`, which Claude Code puts in the hook payload for
// a subagent and leaves absent on the main thread — verified by capturing a
// live payload, not assumed. So this refuses nothing a person types.
//
// WHAT THIS IS NOT. It is a denylist over a shell string, and a shell string
// has unlimited ways to say the same thing. The reviewer is also told it may
// run `pnpm check` and `node scripts/db-test.mjs`, and a process that may run
// node has arbitrary code execution by construction — `pnpm check` writes
// build output every time it passes. So the honest claim is the narrow one:
// the specific acts the agent file promises not to perform are refused, and an
// accidental or casual write is caught. "It cannot write" would be a stronger
// sentence than anything here enforces, which is the defect this hook exists
// to fix, and repeating it one level up would be no better.
//
// Exit 2 blocks the call and returns stderr to the model. Exit 0 allows it.
import { readFileSync } from "node:fs";

const AGENT = "ranza-reviewer";

/** Each rule says what it refuses and what the reviewer should do instead. */
const RULES = [
  {
    name: "an in-place edit",
    pattern: /\b(?:sed|perl|ruby)\b[^|;&\n]*?\s-i(?:\b|')|--in-place\b/,
    instead: "Report the line and let the author change it.",
  },
  {
    name: "a git command that writes",
    pattern:
      /\bgit\s+(?:commit|push|checkout|switch|restore|reset|rebase|merge|cherry-pick|revert|apply|am|stash|clean|add|rm|mv|tag|branch|remote|config|gc|prune|update-ref|filter-branch|worktree)\b/,
    instead:
      "Read with git diff, git log, git show and git status. The branch is the author's.",
  },
  {
    name: "SQL read from a file",
    pattern: /\bpsql\b[^|;&\n]*\s-f\b/,
    instead: "Use psql -c with a single select.",
  },
  {
    name: "a Prisma command that changes a database",
    pattern: /\bprisma\s+(?:migrate|db)\b/,
    instead: "Read the migration files and the catalogue instead.",
  },
  {
    name: "a redirection that writes a file",
    // `>/dev/null` and `2>&1` discard; anything else names a destination.
    pattern: />>?\s*(?!\/dev\/null|&\d)[^\s|;&]/,
    instead: "Put findings in the report, not on disk.",
  },
  {
    name: "tee",
    pattern: /\btee\b/,
    instead: "Put findings in the report, not on disk.",
  },
  {
    name: "a command that changes the filesystem",
    pattern:
      /(?:^|[|;&]|\s)(?:rm|mv|cp|mkdir|rmdir|touch|chmod|chown|ln|truncate|dd|install)\s/,
    instead: "A review does not need to change a file.",
  },
  {
    name: "a package or dependency change",
    pattern: /\b(?:npm|pnpm|yarn)\s+(?:install|add|remove|uninstall|link|up)\b/,
    instead: "Review what is committed, not a tree you have changed.",
  },
];

/** A `psql -c` payload is allowed only when it is a single read. */
const READ_ONLY_SQL = /^\s*\(*\s*(?:select|with|explain|show|table|values)\b/i;

function sqlIsARead(command) {
  const flag = command.match(/\bpsql\b[^|;&\n]*?\s-c\s*(.*)$/s);
  if (!flag) return true;
  const sql = flag[1].trim().replace(/^(['"])([\s\S]*?)\1[\s\S]*$/, "$2");
  // A read followed by a second statement is not a read.
  return READ_ONLY_SQL.test(sql) && !/;\s*\S/.test(sql.replace(/;\s*$/, ""));
}

/** The rule that refuses this command, or null when nothing does. */
function refusal(command) {
  for (const rule of RULES) {
    if (rule.pattern.test(command)) return rule;
  }
  if (!sqlIsARead(command)) {
    return {
      name: "SQL that is not a read",
      instead:
        "Read the catalogue: pg_policies, pg_proc.proacl, information_schema.column_privileges.",
    };
  }
  return null;
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    // A hook that cannot read its input must not become a way through. It also
    // must not block every other agent, so it refuses only its own.
    process.exit(0);
  }

  if (payload.agent_type !== AGENT) process.exit(0);
  if (payload.tool_name !== "Bash") process.exit(0);

  const rule = refusal(String(payload.tool_input?.command ?? ""));
  if (!rule) process.exit(0);

  process.stderr.write(
    `Refused: that is ${rule.name}, and ${AGENT} reviews without changing anything.\n` +
      `${rule.instead}\n` +
      "If a check needs a sabotage, name the sabotage and let the author run it —\n" +
      "the author is the one who has to watch it go red.\n",
  );
  process.exit(2);
}

// One entry path, and the test spawns this file the way Claude Code does
// rather than importing it: the exit code is the whole interface, and an
// imported function would not have one.
main();
