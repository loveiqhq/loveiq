// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));
vi.mock("@features/mira/server/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/mira/server/session")>()),
  getMiraAccount: vi.fn(),
}));

import JournalRoute from "@/app/mira/journal/page";
import MiraSettings from "@features/mira/ui/MiraSettings";
import { SessionStop } from "@features/mira/ui/weekly-session/SessionStop";
import { sessionLinks } from "@features/mira/server/session-emails";
import { getMiraAccount, safeNext } from "@features/mira/server/session";

/** Links into Mira's pages from emails, Google's return and the stop page, and where they land. */

const PROFILE = {
  email: "lea@example.com",
  name: "Lea",
  country: null,
  gender: null,
  style: {},
  remember_chats: true,
  use_assessment: false,
  nudges_on: true,
  nudge_time: "08:00",
  time_zone: "Europe/Berlin",
  reply_language: null,
};
const scrolled = vi.fn();

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ profile: { ...PROFILE }, chats: [] }),
    }))
  );
  // jsdom lays nothing out, so it has no scrollIntoView: the call itself is what's checked.
  Element.prototype.scrollIntoView = scrolled;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  scrolled.mockReset();
  window.history.replaceState({}, "", "/");
});

/** Settings at `hash`, with each section other streams pass, as app/mira/settings/page.tsx does. */
async function openAt(hash: string) {
  window.history.replaceState({}, "", `/mira/settings${hash}`);
  render(
    <MiraSettings
      security={<section>Sign-in &amp; security</section>}
      checks={<p>Self-checks</p>}
      sharedReview={<p>Your rating</p>}
      journal={<p>Daily journal</p>}
      weeklySession={<p>Weekly session</p>}
    />
  );
  await screen.findByRole("heading", { name: "Account" });
}

/** A ResizeObserver whose growth the test sets off (jsdom has none, and lays nothing out). */
function observeGrowth() {
  const seen: Array<() => void> = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private grew: () => void) {}
      observe() {
        seen.push(this.grew);
      }
      disconnect() {
        seen.splice(seen.indexOf(this.grew), 1);
      }
    }
  );
  return () => seen.forEach((grew) => grew());
}

describe("a link into a Settings section", () => {
  it("lands on that section once it has loaded (the browser's own jump found nothing)", async () => {
    await openAt("#weekly");
    await waitFor(() => expect(scrolled).toHaveBeenCalledTimes(1));
    expect(scrolled.mock.contexts[0]).toBe(document.getElementById("weekly"));
    // At once: the page's smooth scrolling would glide, and the sections above still grow.
    expect(scrolled).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
  });

  it("stays on it while the sections above load and grow, until the person scrolls", async () => {
    const grow = observeGrowth();
    await openAt("#weekly");
    await waitFor(() => expect(scrolled).toHaveBeenCalledTimes(1));
    grow(); // Sign-in & security, the self-checks and the rating load their own data
    expect(scrolled).toHaveBeenCalledTimes(2);
    expect(scrolled.mock.contexts[1]).toBe(document.getElementById("weekly"));
    window.dispatchEvent(new Event("wheel"));
    grow();
    expect(scrolled).toHaveBeenCalledTimes(2); // the person took over
  });

  it("does nothing without a section to go to", async () => {
    await openAt("#nowhere");
    await new Promise((r) => setTimeout(r, 50));
    expect(scrolled).not.toHaveBeenCalled();
    cleanup();
    // Without a hash it looks nothing up (Firefox warns about an empty id on every visit).
    const lookUp = vi.spyOn(document, "getElementById");
    await openAt("");
    await new Promise((r) => setTimeout(r, 50));
    expect(lookUp).not.toHaveBeenCalledWith("");
    lookUp.mockRestore();
  });

  it("is what the session emails and the stop page link to", async () => {
    expect(new URL(sessionLinks("u1").manage).hash).toBe("#weekly");
    render(<SessionStop token={null} />);
    const link = screen.getByRole("link", { name: "Settings" }).getAttribute("href")!;
    expect(link).toBe("/mira/settings#weekly");
    cleanup();
    await openAt("");
    expect(document.getElementById("weekly")).not.toBeNull();
  });
});

describe("the journal reminder's button, signed out", () => {
  it("comes back to the check-in after sign-in", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    await expect(JournalRoute({ searchParams: Promise.resolve({ checkin: "1" }) })).rejects.toThrow(
      `redirect:/mira/start?next=${encodeURIComponent("/mira/journal?checkin=1")}`
    );
    expect(safeNext("/mira/journal?checkin=1")).toBe("/mira/journal?checkin=1");
    await expect(JournalRoute({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      `redirect:/mira/start?next=${encodeURIComponent("/mira/journal")}`
    );
  });
});
