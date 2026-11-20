import { describe, expect, it } from "vitest";
import { nudgeEmail } from "@features/mira/server/nudges";
import { signInCodeEmail } from "@features/mira/server/sign-in";

/** The company as the imprint names it; every Mira email ends with it (20 Nov 2026). */
const ENTITY =
  "Applied Psychometrics UG (haftungsbeschränkt) · Hasenheide 62, 10967 Berlin · HRB 282986 B, Amtsgericht Charlottenburg · Managing director: Marcus Börner";

const visible = (html: string) => html.replace(/<[^>]+>/g, "");

describe("Mira's email footers", () => {
  const nudge = nudgeEmail({
    type: "agreement",
    body: "Hi Lea, did the soft lamp help?",
    openUrl: "https://x/open",
    prefsUrl: "https://x/prefs",
  });
  const code = signInCodeEmail("12345678");

  it("say nudges come with the free account, not that the person turned them on", () => {
    for (const part of [visible(nudge.html), nudge.text]) {
      expect(part).toContain(
        "Daily nudges from Mira come with your free account. One email a day at most."
      );
      expect(part).not.toContain("You get this because");
    }
  });

  it("name the company in full, in the nudge and the sign-in code email", () => {
    for (const part of [nudge.html, nudge.text, code.html, code.text]) {
      expect(part).toContain(ENTITY);
      expect(part).not.toContain("Applied Psychometrics UG · Berlin");
    }
  });
});
