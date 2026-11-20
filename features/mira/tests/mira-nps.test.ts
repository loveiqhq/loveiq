// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import miraConfig from "@features/mira/content/mira-config.json";
import { npsDue } from "@features/mira/ui/MiraChat";

const reply = (content = "A reply") => ({ role: "assistant" as const, content });
const user = { role: "user" as const, content: "hi" };
const twoReplies = [user, reply(), user, reply()];
const seen = () => JSON.parse(localStorage.getItem("mira.nps.v1") ?? "null");

describe("the NPS question", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("waits for the 3rd conversation and Mira's 2nd reply in it", () => {
    expect(npsDue(true, [user, reply()], false)).toBe(false); // chat 1
    expect(npsDue(true, [user, reply()], false)).toBe(false); // chat 2
    expect(npsDue(true, [user, reply()], false)).toBe(false); // chat 3, one reply so far
    expect(seen()).toEqual({ convos: 3, asked: null });
    expect(npsDue(false, twoReplies, false)).toBe(true); // chat 3, second reply
    expect(seen().asked).toEqual(expect.any(Number));
  });

  it("does not count the intake invitation as a reply", () => {
    localStorage.setItem("mira.nps.v1", JSON.stringify({ convos: 3, asked: null }));
    expect(npsDue(false, [user, reply(), reply(miraConfig.intakeInvitation)], false)).toBe(false);
  });

  it("never asks in a chat where a crisis reply came earlier", () => {
    localStorage.setItem("mira.nps.v1", JSON.stringify({ convos: 5, asked: null }));
    const afterCrisis = [user, reply(miraConfig.crisisMessage), user, reply()];
    expect(npsDue(false, afterCrisis, false)).toBe(false);
  });

  it("never asks right after a crisis reply, and at most once a month", () => {
    localStorage.setItem("mira.nps.v1", JSON.stringify({ convos: 5, asked: null }));
    expect(npsDue(false, twoReplies, true)).toBe(false);
    expect(npsDue(false, twoReplies, false)).toBe(true);
    expect(npsDue(false, twoReplies, false)).toBe(false);
    vi.useFakeTimers({ now: Date.now() + 31 * 24 * 60 * 60 * 1000, toFake: ["Date"] });
    expect(npsDue(false, twoReplies, false)).toBe(true);
  });
});
