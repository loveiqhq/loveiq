// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import V4Prose from "@features/report/ui/v3/V4Prose";

afterEach(cleanup);

describe("V4Prose lists", () => {
  it("numbers an ordered list on from `start` — the blurred tail of a split list", () => {
    const { container } = render(
      <V4Prose blocks={[{ kind: "list", ordered: true, start: 3, items: [[{ text: "third" }]] }]} />
    );
    const ol = container.querySelector("ol.rv4-prose__list.is-ordered");
    expect(ol).not.toBeNull();
    expect((ol as HTMLOListElement).start).toBe(3);
  });

  it("leaves an ordered list without `start` numbering from 1", () => {
    const { container } = render(
      <V4Prose blocks={[{ kind: "list", ordered: true, items: [[{ text: "first" }]] }]} />
    );
    expect(container.querySelector("ol")!.hasAttribute("start")).toBe(false);
  });

  it("keeps a bulleted list a <ul> with no start", () => {
    const { container } = render(
      <V4Prose blocks={[{ kind: "list", items: [[{ text: "a" }], [{ text: "b" }]] }]} />
    );
    const ul = container.querySelector("ul.rv4-prose__list");
    expect(ul).not.toBeNull();
    expect(ul!.hasAttribute("start")).toBe(false);
    expect(ul!.querySelectorAll("li")).toHaveLength(2);
  });
});

describe("V4Prose — the stand-in tail of a ramp paragraph", () => {
  it("sets a veiled run in its own span, the space before it left outside", () => {
    // splitRamp's scrambled tail. useRampFit reads where the span's first line starts,
    // so the span must start on the tail's first glyph, not on the space before it.
    const { container } = render(
      <V4Prose
        blocks={[
          {
            kind: "para",
            runs: [{ text: "Real through here." }, { text: " Xyzq wbnn.", veiled: true }],
          },
        ]}
      />
    );
    const veiled = container.querySelector(".rv4-prose__veiled");
    expect(veiled?.textContent).toBe("Xyzq wbnn.");
    expect(container.querySelector("p")?.textContent).toBe("Real through here. Xyzq wbnn.");
  });

  it("keeps a veiled run's weight inside its span", () => {
    const { container } = render(
      <V4Prose blocks={[{ kind: "para", runs: [{ text: "Bqlg.", weight: 700, veiled: true }] }]} />
    );
    expect(container.querySelector(".rv4-prose__veiled strong")?.textContent).toBe("Bqlg.");
  });
});
