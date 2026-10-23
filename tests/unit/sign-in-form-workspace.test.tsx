/**
 * What only the Operator Workspace's sign-in form does (RANZ-76): says how long
 * to wait when Better Auth says, and offers the way back from the second step.
 * The refusals both forms share are in sign-in-form.test.tsx.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import { SignInForm } from "../../apps/operator-workspace/src/app/[locale]/sign-in/sign-in-form";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
}));

const fetchMock = vi.fn();

function answer(status: number, body: unknown = {}, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function show(locale: "en" | "tr" | "ar" = "en") {
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <SignInForm redirectTo={`/${locale}/reservations?property=p-1`} />
    </NextIntlClientProvider>,
  );
  return messages[locale];
}

function submit(say: (typeof messages)["en"]) {
  fireEvent.change(screen.getByLabelText(say.email), {
    target: { value: "deniz@example.test" },
  });
  fireEvent.change(screen.getByLabelText(say.password), {
    target: { value: "correct-horse-battery-staple" },
  });
  fireEvent.click(screen.getByRole("button", { name: say.signIn }));
}

beforeEach(() => {
  fetchMock.mockReset();
  replace.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the Workspace sign-in form", () => {
  it("SIGN-04: says how long to wait when the limit says", async () => {
    fetchMock.mockResolvedValue(answer(429, {}, { "x-retry-after": "7" }));
    submit(show());
    expect(
      await screen.findByText("Too many attempts. Try again in 7 seconds."),
    ).toBeInTheDocument();
  });

  it("SIGN-04: says one second in the singular", async () => {
    fetchMock.mockResolvedValue(answer(429, {}, { "x-retry-after": "1" }));
    submit(show());
    expect(
      await screen.findByText("Too many attempts. Try again in 1 second."),
    ).toBeInTheDocument();
  });

  it("SIGN-04: says it plainly when the limit does not say how long", async () => {
    fetchMock.mockResolvedValue(answer(429));
    const say = show();
    submit(say);
    expect(await screen.findByText(say.signInThrottled)).toBeInTheDocument();
  });

  it("SIGN-04: a wrong password names a next step, and not only that it was wrong", async () => {
    fetchMock.mockResolvedValue(
      answer(401, { code: "INVALID_EMAIL_OR_PASSWORD" }),
    );
    const say = show();
    submit(say);
    expect(await screen.findByText(say.signInFailed)).toBeInTheDocument();
    expect(say.signInFailed).toMatch(/Prizic support/);
  });

  it("SIGN-02: signing in goes to where they were going", async () => {
    fetchMock.mockResolvedValue(answer(200, { token: "t" }));
    const say = show();
    submit(say);
    await vi.waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/en/reservations?property=p-1"),
    );
  });

  it("SIGN-12: the second step has a way back to the password", async () => {
    fetchMock.mockResolvedValue(answer(200, { twoFactorRedirect: true }));
    const say = show();
    submit(say);

    const back = await screen.findByRole("button", {
      name: say.useAnotherAccount,
    });
    fireEvent.click(back);
    expect(screen.getByLabelText(say.password)).toBeInTheDocument();
    expect(screen.queryByLabelText(say.code)).not.toBeInTheDocument();
  });

  it("SIGN-10: puts the cursor in the email field on a screen that has room", () => {
    const say = show();
    expect(screen.getByLabelText(say.email)).toHaveFocus();
  });
});
