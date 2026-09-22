import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import {
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import {
  CORRECTIONS,
  isCorrection,
  isKnownAction,
  isKnownSubject,
  KNOWN_ACTIONS,
  KNOWN_SUBJECTS,
} from "../../apps/operator-workspace/src/features/audit-log/actions";

/**
 * The audit log's vocabulary is a list in the host and a set of strings in the
 * catalogue. The typed catalogue catches a `KNOWN_ACTIONS` entry with no key
 * at all; this catches what a type cannot — an empty value, and a label written
 * as a flat `"folio.closed"` key, which next-intl would split on the dot and
 * never find. A writer added to a module without a label renders as its raw
 * name — visible, but unfinished.
 */
const t = (locale: SupportedLocale) =>
  createTranslator({
    locale,
    messages: messages[locale] as never,
    onError: (error) => {
      throw error;
    },
  });

describe("the audit log's vocabulary", () => {
  it("knows every action the modules write and nothing else", () => {
    for (const action of KNOWN_ACTIONS)
      expect(isKnownAction(action)).toBe(true);
    expect(isKnownAction("x.y")).toBe(false);
    expect(isKnownAction("")).toBe(false);
  });

  it("knows the three subject types and nothing else", () => {
    for (const subject of KNOWN_SUBJECTS) {
      expect(isKnownSubject(subject)).toBe(true);
    }
    expect(isKnownSubject("guest")).toBe(false);
  });

  it("calls only the reversals corrections", () => {
    for (const action of CORRECTIONS) expect(isCorrection(action)).toBe(true);
    expect(isCorrection("reservation.checked_in")).toBe(false);
    expect(isCorrection("folio.closed")).toBe(false);
  });

  for (const locale of supportedLocales) {
    it(`has a label for every action and subject in ${locale}`, () => {
      const translate = t(locale);
      for (const action of KNOWN_ACTIONS) {
        expect(translate(`auditAction.${action}`)).not.toBe("");
      }
      for (const subject of KNOWN_SUBJECTS) {
        expect(translate(`auditSubject.${subject}`)).not.toBe("");
      }
    });
  }
});
