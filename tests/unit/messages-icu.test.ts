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

describe("the Integrations counts", () => {
  it.each([0, 1, 2, 3, 11, 100])(
    "say how many stopped deliveries were sent again, in every language, at %i",
    (count) => {
      for (const locale of supportedLocales) {
        const say = t(locale, workspace[locale]);
        expect(() => say("integrations.retriedAll", { count })).not.toThrow();
      }
    },
  );

  it.each([1, 2, 3, 11])(
    "say how many deliveries have waited too long, in every language, at %i",
    (count) => {
      for (const locale of supportedLocales) {
        expect(() =>
          t(locale, workspace[locale])("integrations.overdue", { count }),
        ).not.toThrow();
      }
    },
  );

  it("gives Arabic a different word at one, two and few", () => {
    const ar = t("ar", workspace.ar);
    const forms = [1, 2, 3, 11].map((count) =>
      ar("integrations.retriedAll", { count }),
    );
    expect(new Set(forms).size).toBe(4);
  });

  it("never says '1 deliveries' in English", () => {
    const en = t("en", workspace.en);
    expect(en("integrations.retriedAll", { count: 1 })).toBe(
      "1 stopped delivery was sent again.",
    );
    expect(en("integrations.overdue", { count: 1 })).toContain(
      "1 delivery has",
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
                age: "3 hr. ago",
                amount: "₺3.000,00",
                available: 200,
                balance: "₺45,00",
                bed: "x",
                closed: 10,
                code: 503,
                columns: "x",
                count: 2,
                currency: "TRY",
                date: "16 Sep",
                datasets: "x",
                days: 14,
                digest: "4821937",
                duration: "40s",
                email: "x@example.test",
                employed: 3,
                eta: "14:00",
                every: "every week",
                excerpt: "x",
                first: "101",
                floor: 2,
                foreground: "x",
                from: "16 Sep",
                guest: "x",
                hours: 24,
                max: 2,
                megabytes: 25,
                member: "x",
                last: "140",
                left: 1,
                min: 2,
                month: "x",
                n: 2,
                name: "x",
                names: "x",
                nights: 118,
                number: 12,
                occupied: 150,
                of: 9,
                others: 2,
                organization: "x",
                people: 3,
                period: "2026-10",
                permission: "x",
                permissions: "x",
                price: "₺1.500,00",
                property: "x",
                query: "x",
                ratio: "4,5",
                reason: "x",
                reference: "R3F7K2Q",
                reporting: 2,
                revenue: "₺5.900,00",
                role: "x",
                roles: "x",
                room: "x",
                rows: 100000,
                seconds: 2,
                setting: "x",
                shade: "#a35200",
                state: "x",
                status: "x",
                time: "14:00",
                timezone: "Europe/Istanbul",
                to: "20 Sep",
                total: "₺3.000,00",
                type: "x",
                unit: "x",
                until: "14:00",
                value: "x",
                when: "16 Sep",
                who: "x",
                zone: "Europe/Istanbul",
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
