/**
 * The Owner's billing notice (OA-S1-14, ADR 0040): absent unless something is
 * overdue, and then one line naming each overdue Organization. Which
 * Organizations those are is the read's decision — billing-notice.test.ts in
 * the integration suite — so this pins only what is drawn from the answer.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BillingNotice } from "../../apps/operator-workspace/src/app/[locale]/(workspace)/billing-notice";

const title = (organization: string) =>
  `Payment for ${organization} is overdue`;
const description = "Everything keeps working for now.";

afterEach(cleanup);

describe("the billing notice", () => {
  it("draws nothing when no Subscription is past due", () => {
    const { container } = render(
      <BillingNotice description={description} notices={[]} title={title} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("names each overdue Organization, isolated for right-to-left text", () => {
    render(
      <BillingNotice
        description={description}
        notices={[
          { organizationId: "a", organizationName: "Deniz Otelleri" },
          { organizationId: "b", organizationName: "فنادق البحر" },
        ]}
        title={title}
      />,
    );
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Payment for ⁨Deniz Otelleri⁩ is overdue");
    expect(notice).toHaveTextContent("Payment for ⁨فنادق البحر⁩ is overdue");
    expect(notice).toHaveTextContent(description);
  });
});
