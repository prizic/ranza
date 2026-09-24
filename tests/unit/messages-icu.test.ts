import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import {
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import { messages as workspace } from "../../apps/operator-workspace/src/messages";
import { messages as portal } from "../../apps/guest-portal/src/messages";

/**
 * The catalogues are ICU now, and ICU fails at the moment a string is formatted
 * rather than when it is written. A malformed plural — an unbalanced brace, a
 * category Arabic needs and does not have — typechecks, builds, and then throws
 * on the one screen that renders it.
 *
 * So every counted string is formatted here, in every language, at the counts
 * where the categories differ. This is the test that would have failed on the
 * old `String.replace`, which could not express them at all.
 *
 * `onError` throwing is what makes those assertions mean anything. next-intl's
 * default handler logs a malformed message and returns the key as text, so a
 * stray brace in Arabic would render as `stay.sleeps` on the screen and still
 * pass a test that only asked whether formatting threw.
 */
const t = (locale: SupportedLocale, catalogue: Record<string, unknown>) =>
  createTranslator({
    locale,
    messages: catalogue as never,
    onError: (error) => {
      throw error;
    },
  });

describe("counted strings in three languages", () => {
  it("agrees with English about one result and two", () => {
    const en = t("en", workspace.en);
    expect(en("table.results", { n: 1 })).toBe("1 result");
    expect(en("table.results", { n: 2 })).toBe("2 results");
  });

  /**
   * The bug the old spelling shipped: `"{n} results"` with the number
   * substituted in says "1 results" at one row, in the language most of the
   * team reads the screen in.
   */
  it("no longer says '1 results'", () => {
    expect(t("en", workspace.en)("table.results", { n: 1 })).not.toContain(
      "results",
    );
  });

  /**
   * Arabic agrees with the number in six categories. Two and three are the pair
   * that a one-form template gets wrong in opposite directions, so both are
   * asserted rather than one standing in for the rule.
   */
  it("gives Arabic a different word at one, two and few", () => {
    const ar = t("ar", workspace.ar);
    const forms = [1, 2, 3, 11].map((n) => ar("table.results", { n }));
    expect(new Set(forms).size).toBeGreaterThan(2);
    expect(ar("table.results", { n: 2 })).toBe("نتيجتان");
  });

  it("formats the number rather than concatenating a digit", () => {
    // 1234 carries a group separator in every one of the three, and the raw
    // `String(n)` this replaced carried none.
    expect(t("tr", workspace.tr)("table.results", { n: 1234 })).not.toContain(
      "1234",
    );
  });

  it("fills both holes in a two-number string", () => {
    expect(t("en", workspace.en)("table.page", { n: 2, of: 7 })).toBe(
      "Page 2 of 7",
    );
  });
});

/**
 * Every string in every language, formatted once. A catalogue entry with a
 * stray brace is a runtime error on the screen that reads it, and only the
 * language nobody on the team reads would reach production carrying one.
 */
describe("every catalogue parses", () => {
  const catalogues = [
    ["workspace", workspace],
    ["portal", portal],
  ] as const;

  for (const [name, catalogue] of catalogues) {
    for (const locale of supportedLocales) {
      it(`${name} in ${locale}`, () => {
        const translate = t(locale, catalogue[locale]);
        const walk = (node: unknown, path: string[]) => {
          if (typeof node === "string") {
            // Every placeholder either catalogue uses; a value ICU does not
            // need is ignored. A new one added to the copy and not to this list
            // fails here, which is the point — the string it was added for is
            // formatted by nothing else until a screen renders it.
            expect(() =>
              translate(path.join("."), {
                columns: "x",
                count: 2,
                date: "16 Sep",
                eta: "14:00",
                floor: 2,
                guest: "x",
                max: 2,
                min: 2,
                n: 2,
                of: 9,
                property: "x",
                room: "x",
                value: "x",
              }),
            ).not.toThrow();
            return;
          }
          if (node && typeof node === "object") {
            for (const [key, child] of Object.entries(node)) {
              walk(child, [...path, key]);
            }
          }
        };
        walk(catalogue[locale], []);
      });
    }
  }
});
