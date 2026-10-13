// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const fetched = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({ data: { rows: fetched.rows }, loading: false, error: null }),
}));

import LandingVariantTab from "@features/admin/ui/funnel-tabs/LandingVariantTab";

afterEach(cleanup);

const arm = (variant: string, label: string, completed: number, paid: number) => ({
  variant,
  label,
  retired: false,
  completed,
  paid,
  revenue: paid * 6.99,
  paidRate: completed > 0 ? Math.round((paid / completed) * 1000) / 10 : 0,
});

describe("the Landing A/B tab's leader", () => {
  it("names none while a version has fewer buyers than the A/B overview compares on", () => {
    // One purchase against none, the shape of the restart's first days.
    fetched.rows = [arm("white_card", "V2", 9, 1), arm("white_video", "V3", 11, 0)];
    render(<LandingVariantTab days={30} />);
    expect(screen.queryByText("▲")).toBeNull();
  });

  it("marks the better paid rate once each version has enough buyers", () => {
    fetched.rows = [arm("white_card", "V2", 100, 6), arm("white_video", "V3", 100, 5)];
    render(<LandingVariantTab days={30} />);
    expect(screen.getByText("▲").closest("tr")?.textContent).toContain("V2");
  });
});
