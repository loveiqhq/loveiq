import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MiraPrivacyPage from "@/app/mira/privacy/page";

/** Mira's notice says what talking to her by voice does, plainly (22 Nov 2026). */
describe("Mira's privacy notice, on voice", () => {
  const text = renderToStaticMarkup(<MiraPrivacyPage />)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, " ");

  it("says no audio reaches Mira, who turns speech into text, and who reads her replies aloud", () => {
    expect(text).toContain("Talking to Mira by voice");
    expect(text).toContain("Mira never receives your voice or any recording of it, only the text");
    expect(text).toContain("its maker's speech service (for example Apple's or Google's)");
    expect(text).toContain("We never use an online voice");
    expect(text).toContain("Your browser's speech service (for example Apple's or Google's)");
  });

  it("says what is kept, who writes the key points, how to delete them, and what is counted", () => {
    expect(text).toContain("Anthropic's model writes the key points");
    expect(text).toContain("Deleting it deletes its key points and its words, in the chat too");
    expect(text).toContain("numbers, never words");
  });
});
