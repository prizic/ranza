/**
 * What a page that failed to render says and records (RANZ-76): the screen,
 * the line in the log that its reference finds, and a way to try again that
 * fetches the route afresh. The last boundary, `global-error`, draws its own
 * page and reads the language from the address.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import { errorBoundary } from "../../apps/operator-workspace/src/error-boundary-copy";

const { refresh, pathname, navigation } = vi.hoisted(() => {
  const refresh = vi.fn();
  const pathname = { current: "/en/finance" };
  return {
    refresh,
    pathname,
    navigation: () => ({
      useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
      usePathname: () => pathname.current,
    }),
  };
});
vi.mock(
  "../../apps/operator-workspace/node_modules/next/navigation",
  navigation,
);
vi.mock("next/navigation", navigation);
vi.mock("../../apps/operator-workspace/src/app/globals.css", () => ({}));

const { RouteError } =
  await import("../../apps/operator-workspace/src/app/[locale]/route-error");
const { default: GlobalError } =
  await import("../../apps/operator-workspace/src/app/global-error");

const failure = Object.assign(new Error("relation does not exist"), {
  digest: "4821937",
});

beforeEach(() => {
  refresh.mockReset();
  pathname.current = "/en/finance";
});
afterEach(cleanup);

describe("a route that failed to render", () => {
  for (const locale of ["en", "tr", "ar"] as const) {
    it(`ERR-01: says so in ${locale}, with a reference and a way to try again`, () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const reset = vi.fn();
      render(
        <NextIntlClientProvider locale={locale} messages={messages[locale]}>
          <RouteError
            error={failure}
            event="workspace.render_failed"
            reset={reset}
          />
        </NextIntlClientProvider>,
      );

      const say = errorBoundary[locale];
      expect(
        screen.getByRole("heading", { name: say.title }),
      ).toBeInTheDocument();
      expect(screen.getByText(say.description)).toBeInTheDocument();
      expect(
        screen.getByText(say.reference.replace("{digest}", "4821937")),
      ).toBeInTheDocument();

      act(() => {
        fireEvent.click(screen.getByRole("button", { name: say.retry }));
      });
      // Fetched afresh, and the boundary cleared.
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(reset).toHaveBeenCalledTimes(1);
      logged.mockRestore();
    });
  }

  it("ERR-02: records the failure under its own name, with the digest the server logged", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <RouteError
          error={failure}
          event="workspace.render_failed"
          reset={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(logged).toHaveBeenCalledWith("workspace.render_failed", {
      digest: "4821937",
      error: failure,
    });
    logged.mockRestore();
  });

  it("ERR-03: says no reference when the failure has none, rather than a blank one", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <RouteError
          error={new Error("from the browser")}
          event="app.render_failed"
          reset={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
    logged.mockRestore();
  });
});

describe("the last boundary", () => {
  it.each([
    ["/ar/today", "ar", errorBoundary.ar],
    ["/tr/today", "tr", errorBoundary.tr],
    ["/en/anything", "en", errorBoundary.en],
    ["/not-a-language/today", "tr", errorBoundary.tr],
  ] as const)(
    "ERR-04: at %s it speaks %s, and records the failure",
    (path, _locale, say) => {
      pathname.current = path;
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      // It draws its own <html>, which a test container cannot hold, so the
      // markup is read from the document it renders into.
      const container = document.createElement("div");
      document.body.append(container);
      render(<GlobalError error={failure} reset={vi.fn()} />, {
        container,
        baseElement: document.documentElement,
      });
      expect(screen.getByText(say.title)).toBeInTheDocument();
      expect(
        screen.getByText(say.reference.replace("{digest}", "4821937")),
      ).toBeInTheDocument();
      expect(logged).toHaveBeenCalledWith("app.root_render_failed", {
        digest: "4821937",
        error: failure,
      });
      logged.mockRestore();
      container.remove();
    },
  );
});
