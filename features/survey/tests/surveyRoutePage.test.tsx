import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /survey reads Survey 2.0's switch on the server (survey2ForVisit) and hands the answer to the
 * page, which shows the new guide and gives a fresh run the 2.0 screens from the same boolean.
 */
const { mockHeaders, mockSurvey2, mockGatePrice } = vi.hoisted(() => ({
  mockHeaders: vi.fn(),
  mockSurvey2: vi.fn(),
  mockGatePrice: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: () => mockHeaders() }));
vi.mock("@shared/observability/recordVisit", () => ({ recordSurveyPageView: vi.fn() }));
vi.mock("@features/survey/ui/SurveyPage", () => ({ default: () => null }));
vi.mock("@features/pay-to-start/server/entitlement", () => ({ findEntitlementByToken: vi.fn() }));
vi.mock("@features/survey/server/sheetSwitches", () => ({
  surveySheetsForVisit: async () => [],
  gatePriceTestForVisit: (price: unknown) => mockGatePrice(price),
}));
vi.mock("@features/survey/server/survey2Switch", () => ({
  survey2ForVisit: (order: unknown) => mockSurvey2(order),
}));

import Page from "@/app/survey/page";

type PageElement = { props: { survey2: unknown; gatePrice: unknown } };

beforeEach(() => {
  vi.clearAllMocks();
  mockHeaders.mockResolvedValue(new Headers());
  mockGatePrice.mockResolvedValue(false);
});

describe("/survey and Survey 2.0's switch", () => {
  it("tells the page when the switch gives this visit Survey 2.0", async () => {
    mockSurvey2.mockResolvedValue("forced");
    const element = (await Page({
      searchParams: Promise.resolve({ order: "survey2" }),
    })) as PageElement;
    expect(mockSurvey2).toHaveBeenCalledWith("survey2");
    expect(element.props.survey2).toBe("forced");
  });

  it("gives today's survey when it doesn't", async () => {
    mockSurvey2.mockResolvedValue("off");
    const element = (await Page()) as PageElement;
    expect(element.props.survey2).toBe("off");
  });
});

// The EUR 1.99 page's price test reads its own switch beside it (gatePriceTestForVisit), so the
// engine keeps the halfway sheet and the report map from the half that chooses its price.
describe("/survey and the price test's switch", () => {
  it("hands the page the price test's answer, next to Survey 2.0's", async () => {
    mockSurvey2.mockResolvedValue("off");
    mockGatePrice.mockResolvedValue(true);
    const element = (await Page({
      searchParams: Promise.resolve({ price: "1" }),
    })) as PageElement;
    expect(mockGatePrice).toHaveBeenCalledWith("1");
    expect(element.props.gatePrice).toBe(true);
    expect(element.props.survey2).toBe("off");
  });
});
