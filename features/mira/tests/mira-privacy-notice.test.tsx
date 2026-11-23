import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MiraPrivacyPage from "@/app/mira/privacy/page";

/** The round-2 data audit's wording points (22 Nov 2026): the notice says what the code does. */
describe("Mira's privacy notice, made true", () => {
  const text = renderToStaticMarkup(<MiraPrivacyPage />)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

  it("names the note a person may add when stopping nudges, and how long the log keeps it (DATA-7)", () => {
    // features/mira/server/nudge-prefs.ts stopNudges keeps it on the account and in the log.
    expect(text).toContain(
      "If you stop them: the reason you pick and anything you add in your own words."
    );
    expect(text).toContain(
      "Mira's log of labels, steps, ratings, feedback and reasons for stopping nudges is deleted after 12 months."
    );
  });

  it("keeps only the latest sign-in's consent on the account, and says so", () => {
    // Every sign-in overwrites mira_user.consent_at and consent_version (server/store.ts).
    expect(text).not.toContain("We also keep each consent you gave");
    expect(text).toContain(
      "We also keep when you last gave your consent and which wording you saw."
    );
  });

  it("says the 12-month limit runs from the person's last message anywhere, not per chat", () => {
    // mira_forget_old_memory deletes all of a person's chats once their newest message is 12
    // months old, so an old chat of someone who keeps writing stays.
    expect(text).not.toContain("at most 12 months after the last message you wrote");
    expect(text).toContain("If you don't write to Mira for 12 months, they are all deleted.");
  });

  // Round-3 R3-DATA-1: each topic carries its chat's id, and picks count only chats still there.
  it("says a deleted chat stops counting for picks at once, as do all chats before a delete-all", () => {
    expect(text).toContain("a chat you delete stops counting");
    expect(text).toContain("every chat from before you last deleted all your chats");
  });

  // Round-3 R3-DATA-4: the email links' cookie (mira_link, proxy.ts: one hour, sent only to its
  // page) and the under-18 browser mark (mira_minor, a year) were named nowhere.
  it("names the email links' cookie and the under-18 browser mark", () => {
    expect(text).toContain(
      "When you open a link from one of Mira's emails to stop reminders or change your nudges, a cookie keeps the link's key for an hour, sent only to that page, so the key stays out of the page's address."
    );
    expect(text).toContain("a cookie marks that browser for a year");
  });

  // Round-4 security SEC-R4-2: a nudge's link alone only stops (app/api/mira/nudges/preferences).
  it("says a nudge's link stops them, and pausing or fewer needs the sign-in", () => {
    expect(text).not.toContain("You can pause or stop them with the link");
    expect(text).toContain(
      "You can stop them with the link in any nudge, or in Settings. To pause them or get fewer instead, sign in from that link."
    );
  });

  it("keeps the promises the code now keeps: a request covers everything, deletion unlinks", () => {
    expect(text).toContain("A request covers all your Mira data.");
    expect(text).toContain(
      "Deleting your account deletes any words in the log, and the rest is no longer linked to you."
    );
  });
});
