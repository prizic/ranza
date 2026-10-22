/**
 * The catalogue a page reads its words from does not change identity when the
 * server sends the layout again.
 *
 * A server action that revalidates a path re-sends the layout and the
 * catalogue with it, as a new object. Anything memoised on `t` is rebuilt, and
 * a table whose columns are built from `t` re-creates every cell, so whoever
 * had the keyboard on a button in it is put back on the page. The check-in
 * focus test and the refusal on a stale request both failed that way.
 */
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import { StableIntlProvider } from "../../apps/operator-workspace/src/i18n/stable-intl-provider";

afterEach(cleanup);

type Translate = ReturnType<typeof useTranslations>;

function ReadsT({ into }: { into: Translate[] }) {
  const t = useTranslations();
  into.push(t);
  return <p>{t("greeting")}</p>;
}

const sent = (greeting: string) => ({ greeting });

describe("StableIntlProvider", () => {
  it("keeps the same translator when the same catalogue is sent again", () => {
    const seen: Translate[] = [];
    const view = render(
      <StableIntlProvider
        locale="en"
        messages={sent("Hello")}
        timeZone="Europe/Istanbul"
      >
        <ReadsT into={seen} />
      </StableIntlProvider>,
    );
    view.rerender(
      <StableIntlProvider
        locale="en"
        messages={sent("Hello")}
        timeZone="Europe/Istanbul"
      >
        <ReadsT into={seen} />
      </StableIntlProvider>,
    );

    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(new Set(seen).size).toBe(1);
  });

  it("follows the catalogue when the language changes", () => {
    const view = render(
      <StableIntlProvider
        locale="en"
        messages={sent("Hello")}
        timeZone="Europe/Istanbul"
      >
        <ReadsT into={[]} />
      </StableIntlProvider>,
    );
    expect(view.container).toHaveTextContent("Hello");

    view.rerender(
      <StableIntlProvider
        locale="tr"
        messages={sent("Merhaba")}
        timeZone="Europe/Istanbul"
      >
        <ReadsT into={[]} />
      </StableIntlProvider>,
    );
    expect(view.container).toHaveTextContent("Merhaba");
  });

  it("is what the plain provider is not: that one changes translator on every send", () => {
    const seen: Translate[] = [];
    const view = render(
      <NextIntlClientProvider
        locale="en"
        messages={sent("Hello")}
        timeZone="Europe/Istanbul"
      >
        <ReadsT into={seen} />
      </NextIntlClientProvider>,
    );
    view.rerender(
      <NextIntlClientProvider
        locale="en"
        messages={sent("Hello")}
        timeZone="Europe/Istanbul"
      >
        <ReadsT into={seen} />
      </NextIntlClientProvider>,
    );

    expect(new Set(seen).size).toBeGreaterThan(1);
  });
});
