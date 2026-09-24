/**
 * What the sign-in forms say when signing in does not work.
 *
 * Only a refusal may say the email and password did not match. The auth
 * route's rate limit answers 429 after a few attempts, and both forms used to
 * report that as a wrong password — found by the evidence run as F-5, where
 * four sign-ins in ten seconds were told their correct password was wrong. A
 * 5xx said the same, and a request that never answered left the button stuck
 * on "Signing in…" with nothing said at all.
 *
 * Both applications have their own copy of the form and of the catalogue, so
 * every case runs against both.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import { messages as workspaceMessages } from "../../apps/operator-workspace/src/messages";
import { messages as portalMessages } from "../../apps/guest-portal/src/messages";
import { SignInForm as WorkspaceSignInForm } from "../../apps/operator-workspace/src/app/[locale]/sign-in/sign-in-form";
import { SignInForm as PortalSignInForm } from "../../apps/guest-portal/src/app/[locale]/sign-in/sign-in-form";

// Hoisted with the mocks below, which run before this module's own lines.
const { replace, router } = vi.hoisted(() => {
  const replace = vi.fn();
  return {
    replace,
    router: () => ({
      useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
    }),
  };
});
// Each application resolves `next` from its own node_modules, so each path is
// mocked; the bare name would reach neither.
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", router);
vi.mock("../../apps/guest-portal/node_modules/next/navigation", router);

type Catalogue = Record<
  | "signInFailed"
  | "signInThrottled"
  | "signInUnavailable"
  | "challengeFailed"
  | "challengeExpired"
  | "signIn"
  | "verify"
  | "email"
  | "password"
  | "code",
  string
>;

const apps: {
  name: string;
  Form: ComponentType<{ redirectTo: string }>;
  messages: Record<SupportedLocale, Catalogue & Record<string, unknown>>;
}[] = [
  {
    name: "the Operator Workspace",
    Form: WorkspaceSignInForm,
    messages: workspaceMessages as never,
  },
  {
    name: "the Guest Portal",
    Form: PortalSignInForm,
    messages: portalMessages as never,
  },
];

const fetchMock = vi.fn();

function answer(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  replace.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

for (const app of apps) {
  describe(app.name, () => {
    function show(locale: SupportedLocale = "en") {
      render(
        <NextIntlClientProvider
          locale={locale}
          messages={app.messages[locale] as never}
        >
          <app.Form redirectTo={`/${locale}/today`} />
        </NextIntlClientProvider>,
      );
      return app.messages[locale];
    }

    function submit(say: Catalogue) {
      fireEvent.change(screen.getByLabelText(say.email), {
        target: { value: "deniz@example.test" },
      });
      fireEvent.change(screen.getByLabelText(say.password), {
        target: { value: "correct-horse-battery-staple" },
      });
      fireEvent.click(screen.getByRole("button", { name: say.signIn }));
    }

    for (const locale of supportedLocales) {
      it(`says too many attempts, not a wrong password, on a 429 in ${locale}`, async () => {
        fetchMock.mockResolvedValue(
          answer(429, {
            message: "Too many requests. Please try again later.",
          }),
        );
        const say = show(locale);
        submit(say);

        expect(
          await screen.findByText(say.signInThrottled),
        ).toBeInTheDocument();
        expect(screen.queryByText(say.signInFailed)).not.toBeInTheDocument();
        // Nothing typed was wrong, so no field says it was.
        expect(screen.getByLabelText(say.password)).not.toHaveAttribute(
          "aria-invalid",
        );
        expect(screen.getByRole("button", { name: say.signIn })).toBeEnabled();
      });
    }

    it("still says it did not match when it did not", async () => {
      fetchMock.mockResolvedValue(
        answer(401, { code: "INVALID_EMAIL_OR_PASSWORD" }),
      );
      const say = show();
      submit(say);

      expect(await screen.findByText(say.signInFailed)).toBeInTheDocument();
      expect(screen.getByLabelText(say.password)).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });

    it("says signing in is not working on a server error", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      fetchMock.mockResolvedValue(answer(503));
      const say = show();
      submit(say);

      expect(
        await screen.findByText(say.signInUnavailable),
      ).toBeInTheDocument();
      expect(screen.queryByText(say.signInFailed)).not.toBeInTheDocument();
      expect(logged).toHaveBeenCalled();
    });

    // The origin check answers 403 to a host reached by a name Better Auth
    // does not trust. Nothing typed was wrong, so nothing may say it was.
    it("says signing in is not working when the origin is refused", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      fetchMock.mockResolvedValue(
        answer(403, { code: "INVALID_ORIGIN", message: "Invalid origin" }),
      );
      const say = show();
      submit(say);

      expect(
        await screen.findByText(say.signInUnavailable),
      ).toBeInTheDocument();
      expect(screen.queryByText(say.signInFailed)).not.toBeInTheDocument();
      expect(screen.getByLabelText(say.password)).not.toHaveAttribute(
        "aria-invalid",
      );
      expect(logged).toHaveBeenCalledWith(
        "sign-in refused unexpectedly",
        403,
        "INVALID_ORIGIN",
      );
    });

    it("says so, and lets them try again, when there is no answer at all", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      const say = show();
      submit(say);

      expect(
        await screen.findByText(say.signInUnavailable),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: say.signIn })).toBeEnabled();
      // Recorded where it can be seen, not swallowed.
      expect(logged).toHaveBeenCalled();
    });

    it("says too many attempts at the second-factor step too", async () => {
      fetchMock
        .mockResolvedValueOnce(answer(200, { twoFactorRedirect: true }))
        .mockResolvedValueOnce(answer(429));
      const say = show();
      submit(say);

      fireEvent.change(await screen.findByLabelText(say.code), {
        target: { value: "123456" },
      });
      fireEvent.click(screen.getByRole("button", { name: say.verify }));

      expect(await screen.findByText(say.signInThrottled)).toBeInTheDocument();
      expect(screen.queryByText(say.challengeFailed)).not.toBeInTheDocument();
    });

    for (const [typed, code] of [
      ["123456", "INVALID_CODE"],
      ["ABCDE-12345", "INVALID_BACKUP_CODE"],
    ] as const) {
      it(`and still says a wrong code is not valid (${code})`, async () => {
        fetchMock
          .mockResolvedValueOnce(answer(200, { twoFactorRedirect: true }))
          .mockResolvedValueOnce(answer(401, { code }));
        const say = show();
        submit(say);

        fireEvent.change(await screen.findByLabelText(say.code), {
          target: { value: typed },
        });
        fireEvent.click(screen.getByRole("button", { name: say.verify }));

        expect(
          await screen.findByText(say.challengeFailed),
        ).toBeInTheDocument();
        expect(screen.getByLabelText(say.code)).toHaveAttribute(
          "aria-invalid",
          "true",
        );
      });
    }

    // Five wrong codes spend the challenge (400), and after that, or once it
    // times out, it is gone (401). No code can succeed from here, so saying
    // "not valid" would have somebody retype a correct code forever.
    for (const [status, code] of [
      [400, "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE"],
      [401, "INVALID_TWO_FACTOR_COOKIE"],
    ] as const) {
      it(`goes back to the password when the challenge is spent (${code})`, async () => {
        fetchMock
          .mockResolvedValueOnce(answer(200, { twoFactorRedirect: true }))
          .mockResolvedValueOnce(answer(status, { code }));
        const say = show();
        submit(say);

        fireEvent.change(await screen.findByLabelText(say.code), {
          target: { value: "123456" },
        });
        fireEvent.click(screen.getByRole("button", { name: say.verify }));

        expect(
          await screen.findByText(say.challengeExpired),
        ).toBeInTheDocument();
        expect(screen.queryByText(say.challengeFailed)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(say.code)).not.toBeInTheDocument();
        expect(screen.getByLabelText(say.password)).not.toHaveAttribute(
          "aria-invalid",
        );
        expect(screen.getByRole("button", { name: say.signIn })).toBeEnabled();
      });
    }

    it("goes on to the application when it works", async () => {
      fetchMock.mockResolvedValue(answer(200, { token: "t" }));
      const say = show();
      submit(say);

      await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/en/today"));
    });
  });
}
