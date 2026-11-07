/**
 * The form behind a Guest's link: create an account or sign in, then connect
 * the account to the Guest the link was made for (GP-S3-12, GP-S3-13).
 *
 * The requests are the auth route's and the acceptance route's, replaced here
 * by a fetch that answers what each really answers. The one answer taken from
 * the library rather than invented is the refusal of an address that already
 * has an account: it was read from the running Portal, 422 with
 * `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import { messages } from "../../apps/guest-portal/src/messages";
import { InviteForm } from "../../apps/guest-portal/src/app/[locale]/invite/[token]/invite-form";

const { replace, refresh } = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../../apps/guest-portal/node_modules/next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
}));

const TOKEN = "t".repeat(43);
const STAY_HREF = "/en/stay";
const SIGN_IN_HREF = "/en/sign-in";
const PASSWORD = "correct-horse-battery-staple";

const fetchMock = vi.fn();
let logged: ReturnType<typeof vi.spyOn>;

function answer(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Every request made so far, as `[path, parsed body]`. */
function requests(): [string, unknown][] {
  return fetchMock.mock.calls.map(([url, init]) => [
    String(url),
    JSON.parse(String((init as RequestInit).body)),
  ]);
}

function paths(): string[] {
  return requests().map(([path]) => path);
}

beforeEach(() => {
  fetchMock.mockReset();
  replace.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function show(
  props: Partial<Parameters<typeof InviteForm>[0]> = {},
  locale: SupportedLocale = "en",
) {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={messages[locale] as never}
    >
      <InviteForm
        guestEmail="deniz@example.test"
        guestName="Deniz Kaya"
        signedInAs={null}
        signInHref={SIGN_IN_HREF}
        stayHref={STAY_HREF}
        token={TOKEN}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return messages[locale];
}

function fillPassword(say: (typeof messages)["en"]) {
  fireEvent.change(screen.getByLabelText(say.password, { exact: true }), {
    target: { value: PASSWORD },
  });
}

describe("the form behind a Guest's link", () => {
  it("GP-S3-12: creates the account and connects it in one step, then lands on My stay", async () => {
    const say = show();
    fetchMock
      .mockResolvedValueOnce(answer(200, { token: "session" }))
      .mockResolvedValueOnce(answer(200, { outcome: "accepted" }));

    // The name and the address on file are filled in, and both are theirs to change.
    expect(screen.getByLabelText(say.invite.name)).toHaveValue("Deniz Kaya");
    expect(screen.getByLabelText(say.email)).toHaveValue("deniz@example.test");
    fireEvent.change(screen.getByLabelText(say.email), {
      target: { value: "  their.own@example.test " },
    });
    fillPassword(say);
    fireEvent.click(
      screen.getByRole("button", { name: say.invite.createSubmit }),
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith(STAY_HREF));
    expect(refresh).toHaveBeenCalled();
    expect(requests()).toEqual([
      [
        "/api/auth/sign-up/email",
        {
          name: "Deniz Kaya",
          email: "their.own@example.test",
          password: PASSWORD,
        },
      ],
      ["/api/portal-invitation/accept", { token: TOKEN }],
    ]);
    expect(logged).not.toHaveBeenCalled();
  });

  it("GP-S3-12: signs in instead when they say they already have an account", async () => {
    const say = show();
    fetchMock
      .mockResolvedValueOnce(answer(200, { token: "session" }))
      .mockResolvedValueOnce(answer(200, { outcome: "accepted" }));

    fireEvent.click(
      screen.getByRole("button", { name: say.invite.haveAccount }),
    );
    // No name to give for an account that exists.
    expect(screen.queryByLabelText(say.invite.name)).toBeNull();
    fillPassword(say);
    fireEvent.click(
      screen.getByRole("button", { name: say.invite.signInSubmit }),
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith(STAY_HREF));
    expect(requests()).toEqual([
      [
        "/api/auth/sign-in/email",
        { email: "deniz@example.test", password: PASSWORD },
      ],
      ["/api/portal-invitation/accept", { token: TOKEN }],
    ]);
  });

  it("GP-S3-12: moves an address that has an account to signing in, keeping what was typed", async () => {
    const say = show();
    fetchMock.mockResolvedValueOnce(
      answer(422, {
        message: "User already exists. Use another email.",
        code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
      }),
    );

    fireEvent.change(screen.getByLabelText(say.email), {
      target: { value: "has.account@example.test" },
    });
    fillPassword(say);
    fireEvent.click(
      screen.getByRole("button", { name: say.invite.createSubmit }),
    );

    expect(await screen.findByText(say.invite.accountExists)).toBeVisible();
    expect(
      screen.getByRole("button", { name: say.invite.signInSubmit }),
    ).toBeVisible();
    expect(screen.queryByLabelText(say.invite.name)).toBeNull();
    expect(screen.getByLabelText(say.email)).toHaveValue(
      "has.account@example.test",
    );
    expect(paths()).toEqual(["/api/auth/sign-up/email"]);
  });

  it("GP-S3-12: asks for the three things before it asks the server anything", () => {
    const say = show();

    fireEvent.click(
      screen.getByRole("button", { name: say.invite.createSubmit }),
    );

    expect(screen.getByText(say.invite.missing)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("GP-S3-12: says a password is too short in words, not as a wrong password", async () => {
    const say = show();
    fetchMock.mockResolvedValueOnce(
      answer(400, {
        code: "PASSWORD_TOO_SHORT",
        message: "Password too short",
      }),
    );

    fillPassword(say);
    fireEvent.click(
      screen.getByRole("button", { name: say.invite.createSubmit }),
    );

    expect(await screen.findByText(say.invite.passwordTooShort)).toBeVisible();
    expect(screen.queryByText(say.signInFailed)).toBeNull();
  });

  it("GP-S3-12: says too many attempts on a 429 and nothing is connected", async () => {
    const say = show();
    fetchMock.mockResolvedValueOnce(answer(429, { message: "Too many" }));

    fillPassword(say);
    fireEvent.click(
      screen.getByRole("button", { name: say.invite.createSubmit }),
    );

    expect(await screen.findByText(say.signInThrottled)).toBeVisible();
    expect(paths()).toEqual(["/api/auth/sign-up/email"]);
  });

  it("GP-S3-12: says the sign-in is not working when nobody answered, and logs it", async () => {
    const say = show();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    fillPassword(say);
    fireEvent.click(
      screen.getByRole("button", { name: say.invite.createSubmit }),
    );

    expect(await screen.findByText(say.signInUnavailable)).toBeVisible();
    expect(logged).toHaveBeenCalledWith(
      "sign-in request failed",
      "/api/auth/sign-up/email",
      expect.any(TypeError),
    );
  });

  it("GP-S3-12: sends an account with a second sign-in step to the sign-in page, and does not connect it", async () => {
    const say = show();
    fetchMock.mockResolvedValueOnce(answer(200, { twoFactorRedirect: true }));

    fireEvent.click(
      screen.getByRole("button", { name: say.invite.haveAccount }),
    );
    fillPassword(say);
    fireEvent.click(
      screen.getByRole("button", { name: say.invite.signInSubmit }),
    );

    expect(await screen.findByText(say.invite.twoFactor)).toBeVisible();
    expect(
      screen.getByRole("link", { name: say.invite.goSignIn }),
    ).toHaveAttribute("href", SIGN_IN_HREF);
    expect(paths()).toEqual(["/api/auth/sign-in/email"]);
    expect(replace).not.toHaveBeenCalled();
  });

  it("GP-S3-13: says something went wrong, logs the status, and retries the connection without making the account again", async () => {
    const say = show();
    fetchMock
      .mockResolvedValueOnce(answer(200, { token: "session" }))
      .mockResolvedValueOnce(answer(500))
      .mockResolvedValueOnce(answer(200, { outcome: "accepted" }));

    fillPassword(say);
    fireEvent.click(
      screen.getByRole("button", { name: say.invite.createSubmit }),
    );

    expect(await screen.findByText(say.invite.failed)).toBeVisible();
    expect(logged).toHaveBeenCalledWith(
      "portal invitation was not accepted",
      500,
    );
    // The account exists and is signed in: only the connection is offered again,
    // and nothing is asked for twice.
    expect(screen.queryByLabelText(say.password)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: say.invite.connect }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith(STAY_HREF));
    expect(paths()).toEqual([
      "/api/auth/sign-up/email",
      "/api/portal-invitation/accept",
      "/api/portal-invitation/accept",
    ]);
  });

  it("GP-S3-13: treats an answer it does not know as a failure, not as a success", async () => {
    const say = show({ signedInAs: "deniz@example.test" });
    fetchMock.mockResolvedValueOnce(answer(200, { outcome: "something_new" }));

    fireEvent.click(screen.getByRole("button", { name: say.invite.connect }));

    expect(await screen.findByText(say.invite.failed)).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(
      "portal invitation answered unexpectedly",
      {
        outcome: "something_new",
      },
    );
  });

  it("GP-S3-13: treats an answer that is not JSON as a failure and logs it", async () => {
    const say = show({ signedInAs: "deniz@example.test" });
    fetchMock.mockResolvedValueOnce(
      new Response("<html>bad gateway</html>", { status: 200 }),
    );

    fireEvent.click(screen.getByRole("button", { name: say.invite.connect }));

    expect(await screen.findByText(say.invite.failed)).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(
      "portal invitation answer was not JSON",
      200,
      expect.any(SyntaxError),
    );
  });

  it("GP-S3-09: connects a signed-in visitor without asking for a password", async () => {
    const say = show({ signedInAs: "deniz@example.test" });
    fetchMock.mockResolvedValueOnce(answer(200, { outcome: "accepted" }));

    expect(screen.queryByLabelText(say.password)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: say.invite.connect }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith(STAY_HREF));
    expect(paths()).toEqual(["/api/portal-invitation/accept"]);
  });

  it("GP-S3-09: lets a signed-in visitor sign out and use another account, on a shared phone", async () => {
    const say = show({ signedInAs: "somebody.else@example.test" });
    fetchMock.mockResolvedValueOnce(answer(200, { success: true }));

    fireEvent.click(
      screen.getByRole("button", { name: say.invite.useAnother }),
    );

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(paths()).toEqual(["/api/auth/sign-out"]);
    // Back to the form that asks who they are.
    expect(
      screen.getByRole("button", { name: say.invite.createSubmit }),
    ).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
  });

  it("GP-S3-09: says so when signing out did not work, and stays signed in", async () => {
    const say = show({ signedInAs: "somebody.else@example.test" });
    fetchMock.mockResolvedValueOnce(answer(500));

    fireEvent.click(
      screen.getByRole("button", { name: say.invite.useAnother }),
    );

    expect(await screen.findByText(say.signInUnavailable)).toBeVisible();
    expect(
      screen.getByRole("button", { name: say.invite.connect }),
    ).toBeVisible();
  });

  for (const locale of supportedLocales) {
    for (const outcome of [
      "unknown",
      "expired",
      "revoked",
      "used",
      "another_guest",
    ] as const) {
      it(`GP-S3-03: says ${outcome} in words in ${locale} and leaves a way on`, async () => {
        const say = show({ signedInAs: "deniz@example.test" }, locale);
        fetchMock.mockResolvedValueOnce(answer(200, { outcome }));

        fireEvent.click(
          screen.getByRole("button", { name: say.invite.connect }),
        );

        expect(
          await screen.findByText(say.invite.refused[outcome].title),
        ).toBeVisible();
        expect(
          screen.getByText(say.invite.refused[outcome].body),
        ).toBeVisible();
        expect(
          screen.getByRole("link", { name: say.goToStay }),
        ).toHaveAttribute("href", STAY_HREF);
        expect(replace).not.toHaveBeenCalled();
      });
    }
  }
});

describe("the welcome a link opens on", () => {
  // The same link reaches a student at a dormitory, who is no Guest there, and
  // the page cannot tell which (it is not told the stay's type).
  it.each([
    ["tr", /misafir/i],
    ["en", /guest/i],
    ["ar", /الضيف/],
  ] as const)("names no Guest in %s", (locale, guestWord) => {
    expect(messages[locale].invite.summary).not.toMatch(guestWord);
  });
});
