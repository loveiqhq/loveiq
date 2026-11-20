// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import crisisJson from "@features/mira/content/crisis-lines.json";
import { crisisFor, type CrisisLine } from "@features/mira/server/crisis";
import { SupportPanel } from "@features/mira/ui/SupportPanel";

/** The support lines, checked on each operator's own site on 20 Nov 2026. */
type Country = { code: string; name: string; emergency?: string; lines: CrisisLine[] };
const DATA = crisisJson as unknown as { countries: Country[]; fallback: Country };

afterEach(cleanup);

describe("crisis-lines.json", () => {
  it("names every line and gives each a way to reach it", () => {
    const all = [...DATA.countries, DATA.fallback];
    expect(new Set(all.map((c) => c.code)).size).toBe(all.length);
    for (const c of all) {
      expect(c.emergency, c.code).toBeTruthy();
      for (const l of c.lines) {
        expect(l.name, `${c.code} line`).toBeTruthy();
        expect(["crisis", "sexual_violence", "directory"]).toContain(l.type);
        expect(Boolean(l.phone || l.text || l.url), l.name).toBe(true);
        if (l.keyword) expect(l.text, l.name).toBeTruthy();
        if (l.url) expect(l.url).toMatch(/^https:\/\//);
        if (l.type !== "directory") expect(l.hours, l.name).toBeTruthy();
      }
      // A crisis line for every listed country (the fallback is a directory).
      if (c.code !== "OTHER")
        expect(
          c.lines.some((l) => l.type === "crisis"),
          c.code
        ).toBe(true);
    }
  });

  it("says who a line is for when it isn't everyone", () => {
    const line = (code: string, name: string) =>
      crisisFor(code).lines.find((l) => l.name === name)!;
    expect(line("DE", "Hilfetelefon Gewalt gegen Frauen").who).toBe("for women");
    expect(line("AT", "Frauenhelpline gegen Gewalt").who).toBe("for women");
    expect(line("GB", "Rape Crisis 24/7 Support Line").who).toBe("England and Wales, 16+");
    // Men, Scotland and Northern Ireland have their own lines.
    expect(crisisFor("DE").lines.some((l) => l.who === "for men")).toBe(true);
    expect(crisisFor("AT").lines.some((l) => l.who === "for men")).toBe(true);
    expect(crisisFor("GB").lines.map((l) => l.who)).toEqual(
      expect.arrayContaining(["Scotland", "Northern Ireland"])
    );
    expect(crisisFor("CH").lines.some((l) => l.type === "sexual_violence")).toBe(true);
  });
});

describe("the support panel", () => {
  it("offers a text-only line as a text link with its keyword, never as a call", () => {
    render(<SupportPanel highlight={{ code: "GB" }} onClose={() => {}} />);
    const uk = screen.getByRole("region", { name: "United Kingdom" });
    const shout = within(uk).getByText("Shout").closest("li")!;
    expect(shout.textContent).toContain("text SHOUT to 85258");
    expect(within(shout).getByRole("link", { name: "85258" })).toHaveAttribute("href", "sms:85258");
    expect(shout.querySelector('a[href^="tel:"]')).toBeNull();
    const samaritans = within(uk).getByText("Samaritans").closest("li")!;
    expect(within(samaritans).getByRole("link", { name: "116 123" })).toHaveAttribute(
      "href",
      "tel:116123"
    );
    expect(samaritans.textContent).toContain("24/7");
    // The person's country comes first.
    expect(screen.getAllByRole("region")[0]).toBe(uk);
  });

  it("shows a line's audience, call-or-text numbers and notes", () => {
    render(<SupportPanel highlight={{ code: "IE" }} onClose={() => {}} />);
    const ie = screen.getByRole("region", { name: "Ireland" });
    expect(within(ie).getByText("Calls from a hidden number aren’t connected.")).toBeTruthy();
    const us = screen.getByRole("region", { name: "United States" });
    const lifeline = within(us).getByText("988 Suicide & Crisis Lifeline").closest("li")!;
    expect(lifeline.textContent).toContain("call 988 or text 988");
    const de = screen.getByRole("region", { name: "Germany" });
    expect(within(de).getByText("(for men)")).toBeTruthy();
  });
});
