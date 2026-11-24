import { readFileSync } from "node:fs";
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

  it("is matched by the site's privacy policy on pausing Mira's nudges", () => {
    const site = readFileSync("app/privacy-policy/page.tsx", "utf8")
      .replace(/\s+/g, " ")
      .replace(/&apos;/g, "'");
    expect(site).not.toContain("pause or stop them with the link");
    expect(site).toContain(
      "you can stop them with the link in each email or in Mira's settings, and pause them or get fewer after signing in from that link."
    );
  });

  it("keeps the promises the code now keeps: a request covers everything, deletion unlinks", () => {
    expect(text).toContain("A request covers all your Mira data.");
    // Round 4: a copy keeps to rows tied to the person (GDPR Art. 15(4)), and says so; chats kept
    // without an account (24 Nov 2026) stay out too, unless one came into the account.
    expect(text).toContain(
      "A copy leaves out what was done in a browser before you signed in, chats we kept without an account included, as on a shared browser that can be someone else's. A chat that came into your account when you signed up is in it."
    );
    expect(text).toContain(
      "Deleting your account deletes any words in the log, and the rest is no longer linked to you."
    );
  });

  // Eman, 24 Nov 2026: chats without an account are kept too (store.ts keepAnonExchange, the
  // chat route), only under the tick that says so; deleted by "Delete this chat", at sign-up
  // when the account keeps no chats, by the under-18 stop, or 12 months after the last message.
  it("says a chat without an account is kept, why, how to delete it and for how long", () => {
    expect(text).not.toContain("not by us");
    expect(text).not.toContain("Without an account, that count is all we keep of a voice session.");
    for (const line of [
      "Without an account, your chat too: what you write and what Mira writes back, with this browser's random id and which wording of the tick you agreed to. The tick before your first message says so.",
      "Without an account it counts your free message, links your steps and keeps your chat with this browser.",
      "Without an account, to keep your chat: to coach you, as it comes into an account if you make one, and so our team can read chats to improve Mira. Legal basis: your explicit consent (Art. 6(1)(a) and Art. 9(2)(a) GDPR), which you give with the tick before your first message.",
      "Without an account, your chat is kept in this browser, and starting a new chat or clearing your browser data removes it there. From the first message you send after the tick that says so, we keep a copy too, with this browser's random id. “Delete this chat” on the chat page deletes it, here and on our servers, with any other chat we kept from this browser; otherwise we delete it 12 months after its last message. If you make an account, it moves into the account and is kept like your other chats, or, with “Remember our conversations” off, is deleted.",
      "Without an account, use “Delete this chat” on the chat page. We can't tell from an email which chat kept without an account is yours, so that button, in the browser you used, is the way to delete it.",
      "In a browser without an account, the chat there is cleared, every chat we kept from that browser is deleted, and a cookie marks that browser for a year.",
      "Without an account, we keep a session's words in your chat like typed ones, and of the session itself only that count.",
    ]) {
      expect(text, line).toContain(line);
    }
  });
});
