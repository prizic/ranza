/**
 * Every action a Ranza module records has a name on the audit log screen.
 *
 * The screen's vocabulary is a list in the host (`KNOWN_ACTIONS`) and the
 * modules write their actions as string literals; nothing but a test ties the
 * two together, and the first version of the list shipped seven short. So this
 * reads the writers. A module records an action in one of two shapes —
 * `action: "noun.verb"` in a `recordWithin` entry, or the literal alone on its
 * own line as an argument to a helper that takes the action by position — and
 * both are read here. A third shape would not be seen; the comment in
 * `actions.ts` says so, which is the honest limit of a text scan.
 *
 * Deliberately not every dotted literal: an outbox `eventType` and a
 * permission key are dotted too and are not actions.
 *
 * The facts a record carries are read the same way: every key of a
 * `context: { ... }` literal is either given a name on the record screen,
 * hidden on purpose, or shown by the action's own layout. A key that is none
 * of them would print as itself, `toEndsOn` where a reader needs "Departure
 * after" (AUDIT-01), and it was the first thing an owner saw of a stay's
 * history. A context built elsewhere and handed over by name is a shape this
 * scan does not see.
 *
 * Every source file of a module is read, not only `module.ts`: a write
 * contract a caller runs inside its own transaction (`write.ts`) records its
 * own action, and a scan of one file would call that action's label an
 * orphan. `contracts.ts` and `index.ts` are left out because they write
 * nothing and are where a dotted constant would sit.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_ACTIONS } from "../../apps/operator-workspace/src/features/audit-log/actions";
import {
  CONTEXT_KEYS,
  HIDDEN_CONTEXT_KEYS,
  isAccountedFor,
  STRUCTURED_CONTEXT_KEYS,
} from "../../apps/operator-workspace/src/features/audit-log/context-keys";

const ranza = path.resolve(__dirname, "../../packages/ranza");

const RECORDED = /^\s*action: "([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)",?\s*$/;
const POSITIONAL = /^\s*"([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)",\s*$/;

function actionsWrittenBy(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line) => {
      const match = RECORDED.exec(line) ?? POSITIONAL.exec(line);
      return match ? [match[1]!] : [];
    });
}

const NOT_WRITERS = new Set(["contracts.ts", "index.ts"]);

function sourcesOf(module: string): string[] {
  const directory = path.join(ranza, module, "src");
  return readdirSync(directory)
    .filter((file) => file.endsWith(".ts") && !NOT_WRITERS.has(file))
    .map((file) => path.join(directory, file));
}

/**
 * A security-definer function that writes its own audit record, in the
 * statement that makes the change, calls `app.record_webhook_audit(` with the
 * action as its third argument (ADR 0045). That is a fourth shape, and a
 * migration is where it is read.
 */
const SQL_AUDIT_CALL =
  /record_webhook_audit\(\s*[^,]+,\s*[^,]+,\s*'([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)'/g;

function actionsWrittenBySql(): string[] {
  const migrations = path.resolve(__dirname, "../../prisma/migrations");
  return readdirSync(migrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      [
        ...readFileSync(
          path.join(migrations, entry.name, "migration.sql"),
          "utf8",
        ).matchAll(SQL_AUDIT_CALL),
      ].map((match) => match[1]!),
    );
}

const written = new Set([
  ...readdirSync(ranza, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => sourcesOf(entry.name))
    .flatMap(actionsWrittenBy),
  ...actionsWrittenBySql(),
]);

describe("the modules and the screen agree on what is written", () => {
  it("finds the writers at all", () => {
    // A scan that matched nothing would pass the next test for free.
    expect(written.size).toBeGreaterThanOrEqual(9);
  });

  it("every recorded action has a label", () => {
    const unlabelled = [...written].filter(
      (action) => !(KNOWN_ACTIONS as readonly string[]).includes(action),
    );
    expect(unlabelled).toEqual([]);
  });

  it("every label is for an action somebody writes", () => {
    const orphaned = KNOWN_ACTIONS.filter((action) => !written.has(action));
    expect(orphaned).toEqual([]);
  });
});

/**
 * The keys of every `context: { ... }` literal: those at the top of the object
 * (`key: value` and the shorthand `key,`), and those inside a conditional
 * spread (`...(x ? { key: value } : {})`), which is how an optional fact is
 * written. A nested object's own keys are the shape of one fact and not
 * facts of the record.
 */
function contextKeysWrittenBy(file: string): string[] {
  // A comment between two facts has commas of its own, which would split the
  // fact after it into a sentence and hide its key: `nightsCharged` was
  // unlabelled on the record screen for that reason.
  const text = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gm, "");
  const keys: string[] = [];
  for (const start of text.matchAll(/context: \{/g)) {
    const open = start.index + start[0].length - 1;
    let depth = 0;
    let close = open;
    for (; close < text.length; close += 1) {
      if (text[close] === "{") depth += 1;
      else if (text[close] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = text.slice(open + 1, close);
    const entries: string[] = [];
    let entry = "";
    let nesting = 0;
    for (const character of body) {
      if ("{([".includes(character)) nesting += 1;
      if ("})]".includes(character)) nesting -= 1;
      if (character === "," && nesting === 0) {
        entries.push(entry);
        entry = "";
      } else {
        entry += character;
      }
    }
    entries.push(entry);
    for (const raw of entries) {
      const part = raw.trim();
      const named = /^(\w+)\s*(:|$)/.exec(part);
      if (named) keys.push(named[1]!);
      else if (part.startsWith("...")) {
        for (const spread of part.matchAll(/[{,]\s*(\w+)\s*:/g)) {
          keys.push(spread[1]!);
        }
      }
    }
  }
  return keys;
}

const contextKeys = new Set(
  readdirSync(ranza, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => sourcesOf(entry.name))
    .flatMap(contextKeysWrittenBy),
);

describe("the modules and the screen agree on what a record says", () => {
  it("finds the contexts at all", () => {
    expect(contextKeys.size).toBeGreaterThanOrEqual(40);
    expect(contextKeys.has("toEndsOn")).toBe(true);
  });

  it("every fact a writer records is named, hidden or shown by the action's own layout", () => {
    expect([...contextKeys].filter((key) => !isAccountedFor(key))).toEqual([]);
  });

  it("no key is both named and hidden, and none is named for nothing", () => {
    expect(
      CONTEXT_KEYS.filter(
        (key) =>
          HIDDEN_CONTEXT_KEYS.has(key) || STRUCTURED_CONTEXT_KEYS.has(key),
      ),
    ).toEqual([]);
    // `role`, `from`, `to` and the like are named and written; a name nobody
    // writes is a label for a fact that no longer exists. Keys written through
    // a context built elsewhere are named by hand, so the exceptions are listed.
    const writtenElsewhere = new Set(["added", "removed", "properties"]);
    expect(
      CONTEXT_KEYS.filter(
        (key) => !contextKeys.has(key) && !writtenElsewhere.has(key),
      ),
    ).toEqual([]);
  });
});
