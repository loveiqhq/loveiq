import { describe, expect, it } from "vitest";
import {
  meetingOf,
  parseNextSteps,
  renderPromises,
  type MeetingPromise,
} from "@features/brain/server/promises";

const NOTES = [
  "Summary",
  "* [Mark Oldenburg] Not a next step: this bullet sits above the heading.",
  "Next steps",
  "* [Mark Oldenburg, Sanjin Kacevac] Finalize Content: Finalize the fantasy versus reality chapter.",
  "* [The group] Review Chapters: Review four chapters of content across archetypes.",
  "",
  "* [Eman Cickusic] Fix Tagging: Investigate why tagging fails in Figma.",
  "Want to see more? View the full notes",
  "* [Fatih Hadzic] Also not one: this comes after the list ended.",
].join("\n");

describe("parseNextSteps", () => {
  it("reads only the list under the heading, one owner list per item, and stops where it ends", () => {
    expect(parseNextSteps(NOTES)).toEqual([
      {
        owners: ["Mark Oldenburg", "Sanjin Kacevac"],
        title: "Finalize Content",
        detail: "Finalize the fantasy versus reality chapter.",
      },
      {
        owners: ["The group"],
        title: "Review Chapters",
        detail: "Review four chapters of content across archetypes.",
      },
      {
        owners: ["Eman Cickusic"],
        title: "Fix Tagging",
        detail: "Investigate why tagging fails in Figma.",
      },
    ]);
  });

  it("finds nothing in notes without a next-steps heading", () => {
    expect(parseNextSteps("* [Mark Oldenburg] Task: do it.")).toEqual([]);
  });
});

describe("meetingOf", () => {
  it("takes the meeting's own day from the title, and the name without the time", () => {
    expect(
      meetingOf(
        "Meeting notes: Report Content Synch - 2026/09/17 17:27 WEST - Notes by Gemini (part 2 of 37)",
        "2026-09-18"
      )
    ).toEqual({ name: "Report Content Synch", date: "2026-09-17" });
    expect(meetingOf("Drive: Something else", "2026-09-18")).toEqual({
      name: "Drive: Something else",
      date: "2026-09-18",
    });
  });
});

describe("renderPromises", () => {
  const p = (owners: string[], title: string): MeetingPromise => ({
    owners,
    title,
    detail: "x.",
    meeting: "LoveIQ Sync",
    date: "2026-09-24",
    id: "drive/doc:a",
    url: null,
  });

  it("gives a person their own items plus the group's, and nobody else's", () => {
    const out = renderPromises(
      [p(["Mark Oldenburg"], "Mine"), p(["The group"], "Ours"), p(["Eman Cickusic"], "Theirs")],
      "Mark Oldenburg"
    );
    expect(out).toContain("Mine");
    expect(out).toContain("Ours");
    expect(out).not.toContain("Theirs");
  });

  it("says when a person has nothing, pointing at the spelling", () => {
    expect(renderPromises([p(["Mark Oldenburg"], "Mine")], "Mark")).toMatch(
      /Check the exact spelling/
    );
  });
});
