import { describe, expect, it } from "vitest";

import { listPageShots } from "@features/brain/server/see/pages";

/**
 * show_page's list says which landing shots are the live test's arms, so a critique is of a
 * page visitors see. Round 4 (from the 2026-11-16 release) runs the video page against the
 * new pain-point page; round 3's question-card page is no visitor's any more.
 */
describe("show_page's landing shots", () => {
  it("names round 4's two arms as the live ones, and the question-card page as retired", () => {
    const text = listPageShots();
    expect(text).toContain(
      "`landing-white-video` and `landing-pain-point` are the two arms of the live landing test"
    );
    expect(text).toMatch(/`landing-white` is round 3's question-card version, retired/);
    expect(text).not.toContain("the two arms of the live hero test");
  });
});
