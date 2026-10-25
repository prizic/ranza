/**
 * What the Branding screen does before anything is saved (CONFIGURATION-01, 02,
 * 04, 05).
 *
 * A logo is judged the moment it is chosen, against the module's own limits; an
 * unsaved draft is asked about before a link takes it away; and resetting the
 * brand says what goes before it happens, and does nothing until it is
 * confirmed. The server actions and the browser's image decoder are doubles:
 * what is asserted is what the screen makes of their answers.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";

const resetBranding = vi.fn();
const saveBranding = vi.fn();
const readImageSize = vi.fn();

vi.mock("../../apps/operator-workspace/src/server/branding", () => ({
  assessBrandingColor: vi.fn(),
  resetBranding,
  saveBranding,
}));
vi.mock(
  "../../apps/operator-workspace/src/features/branding/logo-check",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../apps/operator-workspace/src/features/branding/logo-check")
    >()),
    readImageSize,
  }),
);

const { BrandingView } =
  await import("../../apps/operator-workspace/src/features/branding/components/branding-view");

const LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  maxDimension: 4096,
  minHeight: 128,
};
const DEFAULT_BRAND = {
  primaryColor: null,
  primaryForeground: null,
  primaryText: null,
  logo: null,
};
const SAVED_BRAND = {
  primaryColor: "#0f5132",
  primaryForeground: "#ffffff",
  primaryText: "#0f5132",
  logo: { hash: "abc123" },
} as never;

function show(brand: typeof DEFAULT_BRAND | never = DEFAULT_BRAND) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <a href="/en/today">Today</a>
      <BrandingView
        brand={brand}
        limits={LIMITS}
        locale="en"
        organizationId="d9200001-0000-4000-8000-000000000001"
        organizationName="Deniz Otelleri"
        propertyId="d9200002-0000-4000-8000-000000000001"
      />
    </NextIntlClientProvider>,
  );
}

function choose(file: File) {
  fireEvent.change(screen.getByLabelText("Logo file"), {
    target: { files: [file] },
  });
}

const png = (name = "logo.png") =>
  new File([new Uint8Array(2048)], name, { type: "image/png" });

beforeEach(() => {
  resetBranding.mockReset().mockResolvedValue({ status: "reset" });
  saveBranding.mockReset();
  readImageSize.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:logo");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("choosing a logo", () => {
  it("BR-S1-43: a logo shorter than the minimum is refused on the spot, with its size and the limit, and cannot be saved (CONFIGURATION-01)", async () => {
    readImageSize.mockResolvedValue({ width: 300, height: 64 });
    show();
    choose(png());
    expect(
      await screen.findByText(
        "This image is 64 px tall; a logo must be at least 128 px tall.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText(messages.en.branding.logoBlocksSave)).toBeVisible();
    expect(screen.getByTestId("logo-facts")).toHaveTextContent(
      "logo.png, 300 × 64 px, 2 kB",
    );
  });

  it("BR-S1-43: a logo of the right size says it is usable, and can be saved (CONFIGURATION-01)", async () => {
    readImageSize.mockResolvedValue({ width: 320, height: 160 });
    show();
    choose(png());
    expect(
      await screen.findByText(messages.en.branding.logoUsable),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("BR-S1-43: a file that is not an image is refused without being decoded (CONFIGURATION-01)", async () => {
    show();
    choose(new File(["x"], "logo.pdf", { type: "application/pdf" }));
    expect(
      await screen.findByText(messages.en.branding.logoErrors.unsupported_type),
    ).toBeVisible();
    expect(readImageSize).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("BR-S1-43: a second choice replaces the first, even when the first is read last (CONFIGURATION-01)", async () => {
    let finishFirst: (size: {
      width: number;
      height: number;
    }) => void = () => {};
    readImageSize
      .mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce({ width: 320, height: 160 });
    show();
    choose(png("first.png"));
    choose(png("second.png"));
    await screen.findByText(messages.en.branding.logoUsable);
    finishFirst({ width: 300, height: 64 });
    await waitFor(() =>
      expect(screen.getByTestId("logo-facts")).toHaveTextContent("second.png"),
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});

describe("leaving with a draft", () => {
  it("BR-S1-44: a link is asked about while a colour or a logo is unsaved, and stopped on no (CONFIGURATION-02)", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    readImageSize.mockResolvedValue({ width: 320, height: 160 });
    show();
    fireEvent.change(screen.getByLabelText("Colour (#rrggbb)"), {
      target: { value: "#123456" },
    });
    const notStopped = fireEvent.click(
      screen.getByRole("link", { name: "Today" }),
    );
    expect(confirm).toHaveBeenCalledWith(messages.en.unsavedChanges);
    expect(notStopped).toBe(false);
    confirm.mockRestore();
  });

  it("BR-S1-44: a link is not asked about when nothing is unsaved (CONFIGURATION-02)", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    show();
    expect(fireEvent.click(screen.getByRole("link", { name: "Today" }))).toBe(
      true,
    );
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});

describe("resetting the brand", () => {
  it("BR-S1-45: names what goes, runs nothing until confirmed, and keeps the brand on Keep (CONFIGURATION-04)", async () => {
    show(SAVED_BRAND);
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(messages.en.branding.resetLogoLine),
    ).toBeVisible();
    expect(within(dialog).getByText(/#0f5132/)).toBeVisible();
    expect(resetBranding).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: messages.en.branding.resetKeep,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(resetBranding).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: messages.en.branding.resetConfirm,
      }),
    );
    await waitFor(() => expect(resetBranding).toHaveBeenCalledTimes(1));
  });

  it("BR-S1-45: there is nothing to reset on a brand that is already the default (CONFIGURATION-04)", () => {
    show();
    expect(
      screen.getByRole("button", { name: "Reset to default" }),
    ).toBeDisabled();
  });
});

describe("a brand without a colour (CONFIGURATION-05)", () => {
  it("BR-S1-46: draws the well dashed, in the theme's own green, not as a solid swatch (CONFIGURATION-05)", () => {
    show();
    const well = screen.getByTestId("brand-color-well");
    expect(well.className).toContain("border-dashed");
    expect(well.querySelector("span")).toHaveStyle({
      backgroundColor: "var(--accent)",
    });
  });
});
