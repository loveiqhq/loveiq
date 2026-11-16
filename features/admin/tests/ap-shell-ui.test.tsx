// @vitest-environment jsdom
/**
 * AP's page starts at the sidebar and takes the whole width (Marcus, 10 Nov 2026: "left
 * aligned & responsive on the analytics platform to have as much data as possible on screen";
 * on the 11 Nov call: left alignment and dynamic width, so tables stop scrolling sideways).
 * The design's boards still draw a centred 1160px column, so a design sync must not bring the
 * cap back.
 */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@features/admin/ui/ap/ApSidebar", () => ({
  default: () => <nav aria-label="AP-Analytics" />,
  Mark: () => null,
}));
vi.mock("@features/admin/ui/ap/status", () => ({
  ApStatusProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@features/admin/ui/ap/field-info", () => ({
  FieldInfoProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import ApShell from "@features/admin/ui/ap/ApShell";

afterEach(cleanup);

it("puts the page beside the sidebar with no width cap and no centring", () => {
  render(
    <ApShell>
      <p>Figures</p>
    </ApShell>
  );
  const main = screen.getByRole("main");
  const between: string[] = [];
  for (let el = screen.getByText("Figures").parentElement; el && el !== main; el = el.parentElement)
    between.push(el.className);
  expect(between.length).toBeGreaterThan(0);
  for (const cls of [...between, main.className]) {
    expect(cls).not.toMatch(/(^|\s)(mx-auto|max-w-\S+)/);
  }
});
