import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockIsNonProdDeploy } = vi.hoisted(() => ({ mockIsNonProdDeploy: vi.fn(() => true) }));
vi.mock("@shared/env/is-non-prod-deploy", () => ({ isNonProdDeploy: mockIsNonProdDeploy }));
vi.mock("@features/pay-to-start/ui/status/PayToStartStatusPage", () => ({
  PayToStartStatusPage: () => null,
}));
vi.mock("@features/pay-to-start/ui/landing/PtsCheckout", () => ({
  PtsCheckoutProvider: () => null,
}));

import Page from "@/app/sexual-archetype/checkout/page";

/** What the route hands the status page as its preview. */
async function previewFor(preview: string | string[] | undefined) {
  const element = (await Page({ searchParams: Promise.resolve({ preview }) })) as {
    props: { children: { props: { preview: unknown } } };
  };
  return element.props.children.props.preview;
}

/**
 * `?preview=<state>` shows a checkout status without a payment, off production only. The
 * route decides on the server, so the live site ignores the parameter whatever it says.
 */
describe("/sexual-archetype/checkout's preview", () => {
  beforeEach(() => mockIsNonProdDeploy.mockReturnValue(true));

  it("passes a known state through off production", async () => {
    expect(await previewFor("refunded")).toBe("refunded");
    expect(await previewFor("complete")).toBe("complete");
  });

  it("ignores anything else", async () => {
    expect(await previewFor(undefined)).toBeNull();
    expect(await previewFor("paid")).toBeNull();
    expect(await previewFor(["refunded", "complete"])).toBeNull();
  });

  it("is never honoured on the live site", async () => {
    mockIsNonProdDeploy.mockReturnValue(false);
    expect(await previewFor("refunded")).toBeNull();
  });
});
