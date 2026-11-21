import { describe, expect, it } from "vitest";

import {
  COACHES,
  FINDER,
  coachEventProps,
  coachIdFor,
  guideStarter,
  picksFor,
  searchCoaches,
  searchHome,
  suggestedCoaches,
  type FinderOutcome,
} from "@features/mira/content/coaches";
import miraConfig from "@features/mira/content/mira-config.json";

/** Coaches, "Picked for you", Home search and the guide's "Ask Mira about this" (22 Nov 2026). */

describe("The roster", () => {
  it("has Mira live and five honest coming-soon coaches, in the board's order", () => {
    expect(COACHES.map((c) => [c.name, c.challenge, c.live])).toEqual([
      ["Mira", "Body confidence", true],
      ["Jonas", "Libido challenges", false],
      ["Elif", "Mismatched desire", false],
      ["Ana", "Saying what you want", false],
      ["Theo", "Desire in long relationships", false],
      ["Lena", "Arousal & orgasm", false],
    ]);
  });

  it("reads Home's older Notify me (its labels) and the new ids as one data model", () => {
    expect(coachIdFor("Libido challenges")).toBe("jonas");
    expect(coachIdFor("Saying what you want")).toBe("ana");
    expect(coachIdFor("lena")).toBe("lena");
    for (const bad of ["", "Lena", "libido", "jonas ", "everyone"])
      expect(coachIdFor(bad)).toBeNull();
  });

  it("finds a coach from the person's own words, by area, and nothing for words it doesn't know", () => {
    const names = (q: string, area: Parameters<typeof searchCoaches>[1] = "all") =>
      searchCoaches(q, area).map((c) => c.name);
    expect(names("")).toHaveLength(6);
    expect(names("lights off")).toEqual(["Mira"]);
    expect(names("no desire")).toContain("Jonas");
    expect(names("can’t say what I want")).toEqual(["Ana"]);
    expect(names("ORGASM")).toEqual(["Lena"]);
    expect(names("", "desire")).toEqual(["Jonas", "Elif"]);
    expect(names("partner", "desire")).toEqual(["Elif"]);
    expect(names("lights off", "desire")).toEqual([]);
    expect(names("quantum physics")).toEqual([]);
    expect(names("секс")).toEqual([]);
  });
});

describe("Find my challenge", () => {
  /** Every way through the finder, as the outcomes it ends on and the taps it took. */
  function paths(step = FINDER.start, taps = 1): Array<[FinderOutcome, number]> {
    return step.options.flatMap((o) =>
      o.to === "desire" ? paths(FINDER.desire, taps + 1) : [[o.to, taps] as [FinderOutcome, number]]
    );
  }

  it("ends on a coach, or on no coach yet, in at most two taps", () => {
    for (const [, taps] of paths()) expect(taps).toBeLessThanOrEqual(2);
  });

  it("can lead to every coach, Mira included", () => {
    const ends = new Set(paths().map(([to]) => to));
    for (const c of COACHES) expect(ends).toContain(c.id);
    expect(ends).toContain("none");
  });
});

describe("Picked for you", () => {
  it("follows the person's topics to the practices Mira's own rules give, newest topic first", () => {
    // weight → 3 and 4 ("a body part they want to hide"), comparing → 4 and 3 (Sanjin's config).
    const { picks, personal } = picksFor(["weight", "comparing"]);
    expect(personal).toBe(true);
    expect(picks.map((p) => [p.id, p.reason])).toEqual([
      ["practice-3", "Because you talked about worries about your body"],
      ["practice-4", "Because you talked about comparing yourself to others"],
    ]);
  });

  it("adds a coming-soon coach where it fits, and never more than three picks", () => {
    const { picks } = picksFor(["hiding", "clothes", "causes"]);
    expect(picks.map((p) => p.id)).toEqual(["practice-3", "practice-1", "coach-ana"]);
    expect(picks.at(-1)?.reason).toBe("Because you talked about hiding your body during intimacy");
    expect(picks.at(-1)?.href).toBe("/mira/coaches#coach-ana");
  });

  it("starts with the guide's first practice when no topic is known", () => {
    for (const topics of [[], ["other"], ["not-a-topic"]]) {
      const { picks, personal } = picksFor(topics);
      expect(personal).toBe(false);
      expect(picks.map((p) => [p.id, p.href])).toEqual([["practice-1", "/mira/guide#practice-1"]]);
    }
  });

  it("knows every topic Mira can mark, so a new one never falls through silently", () => {
    for (const t of miraConfig.topics.filter((x) => x.id !== "other")) {
      expect(picksFor([t.id]).personal, t.id).toBe(true);
    }
  });

  it("never echoes weight or shape back at the person, as the guide never does", () => {
    for (const t of miraConfig.topics) {
      for (const p of picksFor([t.id]).picks) expect(p.reason).not.toMatch(/weigh|shape|fat/i);
    }
  });
});

describe("Your coaches", () => {
  it("suggests the coaches the person asked about first, then by topic, then Mira's hand-overs", () => {
    expect(suggestedCoaches([], []).map((s) => [s.coach.id, s.personal])).toEqual([
      ["jonas", false],
      ["ana", false],
    ]);
    expect(suggestedCoaches(["hiding"], ["lena"]).map((s) => [s.coach.id, s.reason])).toEqual([
      ["lena", "You asked to hear when Lena is here"],
      ["ana", "Because you talked about hiding your body during intimacy"],
    ]);
  });

  it("never suggests Mira herself or the same coach twice", () => {
    const ids = suggestedCoaches(["hiding"], ["ana", "mira" as never]).map((s) => s.coach.id);
    expect(ids).toEqual(["ana", "jonas"]);
  });
});

describe("Home search", () => {
  const chats = [
    { id: "c1", title: "Why do compliments feel fake?", updated_at: "2026-11-20T10:00:00Z" },
    { id: "c2", title: "Lights off again", updated_at: "2026-11-19T10:00:00Z" },
  ];

  it("searches coaches, the guide's practices and the person's own chat titles", () => {
    const hits = searchHome("lights", chats);
    expect(hits.map((h) => [h.kind, h.href])).toEqual([
      ["Coach", "/mira"],
      ["Your chat", "/mira?chat=c2"],
    ]);
    expect(searchHome("practice 3", chats).map((h) => h.href)).toEqual(["/mira/guide#practice-3"]);
    expect(searchHome("compliments", chats).map((h) => h.kind)).toEqual(["Coach", "Your chat"]);
  });

  it("opens a coming-soon coach on the roster, never as a chat", () => {
    const jonas = searchHome("libido", []).find((h) => h.kind === "Coach");
    expect(jonas).toMatchObject({ href: "/mira/coaches#coach-jonas", meta: "Coming soon" });
  });

  it("finds nothing for an empty query", () => {
    expect(searchHome("   ", chats)).toEqual([]);
  });
});

describe("Ask Mira about this", () => {
  it("prefills a starter that names the practice, for the guide's seven only", () => {
    expect(guideStarter(3)).toBe(
      "Can you help me with practice 3 from the guide, “What my body does for me”?"
    );
    for (const bad of [0, 8, 2.5, Number.NaN]) expect(guideStarter(bad)).toBeNull();
  });
});

describe("The KPI events' details", () => {
  it("keep ids and numbers only, each event its own", () => {
    expect(coachEventProps("coaches_viewed")).toEqual({});
    expect(coachEventProps("finder_done", "elif")).toEqual({ coach: "elif" });
    expect(coachEventProps("finder_done", "none")).toEqual({ coach: "none" });
    expect(coachEventProps("picks_shown", "chats")).toEqual({ basis: "chats" });
    expect(coachEventProps("pick_clicked", "practice-4")).toEqual({ pick: "practice-4" });
    expect(coachEventProps("pick_clicked", "coach-ana")).toEqual({ pick: "coach-ana" });
    expect(coachEventProps("guide_ask", "7")).toEqual({ practice: 7 });
    expect(coachEventProps("search_empty", "home")).toEqual({ where: "home" });
  });

  it("refuse anything else, so no words can reach the log", () => {
    for (const [name, detail] of [
      ["coaches_viewed", "x"],
      ["finder_done", "Lena"],
      ["finder_done", undefined],
      ["picks_shown", "weight"],
      ["pick_clicked", "practice-8"],
      ["pick_clicked", "coach-mira-and-more"],
      ["guide_ask", "0"],
      ["guide_ask", "3.5"],
      ["search_empty", "lights off"],
    ] as const) {
      expect(coachEventProps(name, detail), `${name} ${detail}`).toBeNull();
    }
  });
});
