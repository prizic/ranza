/**
 * Every action a Ranza module records has a name on the audit log screen.
 *
 * The screen's vocabulary is a list in the host (`KNOWN_ACTIONS`) and the
 * modules write their actions as string literals; nothing but a test ties the
 * two together, and the first version of the list shipped seven short. So this
 * reads the writers, in every source file of every module. A module records an action in one of two shapes —
 * `action: "noun.verb"` in a `recordWithin` entry, or the literal alone on its
 * own line as an argument to a helper that takes the action by position — and
 * both are read here. A third shape would not be seen; the comment in
 * `actions.ts` says so, which is the honest limit of a text scan.
 *
 * Deliberately not every dotted literal: an outbox `eventType` and a
 * permission key are dotted too and are not actions.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_ACTIONS } from "../../apps/operator-workspace/src/features/audit-log/actions";

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

/**
 * Every source file of every module, not only `module.ts`: a module may keep a
 * command in a file of its own (`@ranza/core` keeps Configuration's in
 * `configuration.ts`), and a scan of one filename would read its writes as
 * nobody's.
 */
function sourcesOf(module: string): string[] {
  return readdirSync(path.join(ranza, module, "src"), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

const written = new Set(
  readdirSync(ranza, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => sourcesOf(entry.name))
    .flatMap(actionsWrittenBy),
);

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
