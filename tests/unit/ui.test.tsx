import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  FeedbackState,
  FormField,
  StatusMessage,
} from "../../packages/ui/src/index";

describe("shared accessible feedback components", () => {
  it("connects an expected field error to its invalid control", () => {
    render(
      <FormField
        error="Enter a valid code"
        hint="Six characters"
        id="activation-code"
        label="Activation code"
      />,
    );

    const input = screen.getByRole("textbox", { name: "Activation code" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "Six characters Enter a valid code",
    );
    expect(screen.getByText("Enter a valid code")).toHaveAttribute(
      "role",
      "alert",
    );
  });

  it("announces saved status without interrupting the user", () => {
    render(<StatusMessage>Saved at 21:15</StatusMessage>);
    expect(screen.getByText("Saved at 21:15")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("gives recoverable errors a working primary action", () => {
    const retry = vi.fn();
    render(
      <FeedbackState
        actionLabel="Try again"
        description="Your changes were not saved."
        onAction={retry}
        reference="RANZA-7F2A"
        title="Something went wrong"
        tone="error"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText("RANZA-7F2A")).toHaveAttribute("dir", "ltr");
  });
});
