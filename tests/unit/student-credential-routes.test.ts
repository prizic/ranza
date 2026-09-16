// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("../../apps/product-web/src/server/student-credential-gateway", () => ({
  exchangeStudentActivation: mocks.activate,
  exchangeStudentSignIn: mocks.signIn,
}));

import {
  maxDuration as activationMaxDuration,
  POST as activate,
} from "../../apps/product-web/src/app/[locale]/activate/exchange/route";
import {
  maxDuration as signInMaxDuration,
  POST as signIn,
} from "../../apps/product-web/src/app/[locale]/student/sign-in/exchange/route";

function formRequest(path: string) {
  return new Request(`https://app.ranza.prizic.com${path}`, {
    body: "accessId=student&code=secret&pin=123456",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://app.ranza.prizic.com",
    },
    method: "POST",
  });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

it("keeps credential exchanges inside the database claim lease", () => {
  expect(activationMaxDuration).toBeLessThan(5 * 60);
  expect(signInMaxDuration).toBeLessThan(5 * 60);
});

it("carries an activation failure reference to the localized recovery UI", async () => {
  vi.stubEnv("PRODUCT_WEB_ORIGIN", "https://app.ranza.prizic.com");
  mocks.activate.mockResolvedValue({
    correlationId: "11111111-1111-4111-8111-111111111111",
    success: false,
  });

  const response = await activate(formRequest("/tr/activate/exchange"), {
    params: Promise.resolve({ locale: "tr" }),
  });

  expect(response.headers.get("location")).toBe(
    "/tr/activate?error=invalid&ref=11111111-1111-4111-8111-111111111111",
  );
  expect(response.headers.get("x-correlation-id")).toBe(
    "11111111-1111-4111-8111-111111111111",
  );
});

it("preserves recovery mode after a failed recovery exchange", async () => {
  vi.stubEnv("PRODUCT_WEB_ORIGIN", "https://app.ranza.prizic.com");
  mocks.activate.mockResolvedValue({
    correlationId: "44444444-4444-4444-8444-444444444444",
    success: false,
  });

  const response = await activate(
    formRequest("/en/activate/exchange?mode=recovery"),
    { params: Promise.resolve({ locale: "en" }) },
  );

  expect(response.headers.get("location")).toBe(
    "/en/activate?mode=recovery&error=invalid&ref=44444444-4444-4444-8444-444444444444",
  );
});

it("carries a sign-in failure reference to the localized UI", async () => {
  vi.stubEnv("PRODUCT_WEB_ORIGIN", "https://app.ranza.prizic.com");
  mocks.signIn.mockResolvedValue({
    correlationId: "22222222-2222-4222-8222-222222222222",
    success: false,
  });

  const response = await signIn(formRequest("/en/student/sign-in/exchange"), {
    params: Promise.resolve({ locale: "en" }),
  });

  expect(response.headers.get("location")).toBe(
    "/en/student/sign-in?error=invalid&ref=22222222-2222-4222-8222-222222222222",
  );
});

it("lands a successful sign-in on authenticated Student context", async () => {
  vi.stubEnv("PRODUCT_WEB_ORIGIN", "https://app.ranza.prizic.com");
  mocks.signIn.mockResolvedValue({
    correlationId: "33333333-3333-4333-8333-333333333333",
    success: true,
  });

  const response = await signIn(formRequest("/ar/student/sign-in/exchange"), {
    params: Promise.resolve({ locale: "ar" }),
  });

  expect(response.headers.get("location")).toBe("/ar/student");
});
