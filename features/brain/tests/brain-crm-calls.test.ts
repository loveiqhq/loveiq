import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...(a as [])),
}));
const mockResolve = vi.fn();
const mockQuery = vi.fn();
vi.mock("@features/brain/server/act/notion", () => ({
  resolveDatabase: (...a: unknown[]) => mockResolve(...a),
  queryNotionDatabase: (...a: unknown[]) => mockQuery(...a),
  createNotionPage: vi.fn(),
  updateNotionPage: vi.fn(),
}));

import {
  fileCrmCalls,
  matchCall,
  nextStepsOf,
  planFiling,
  readCalls,
  readCrm,
  renderCrmCalls,
  sessionBody,
  speakersIn,
  type Call,
  type CrmDeps,
  type CrmPerson,
  type SessionRow,
} from "@features/brain/server/crm-calls";

const call = (over: Partial<Call> = {}): Call => ({
  docId: "doc:1",
  title: "60 min with Mark (Kiu Coates) - 2026/09/29 11:00 CEST - Notes by Gemini",
  url: "https://docs.google.com/document/d/NOTES1/edit",
  date: "2026-09-29",
  summary:
    "Summary\nThey liked the report.\n\nNext steps\n* [Mark Oldenburg] Send pricing: Send the pricing deck by Friday.\n",
  attendees: ["kiu@kiucoates.com", "mo@loveiq.org"],
  eventTitle: "60 min with Mark (Kiu Coates)",
  speakers: ["Mark Oldenburg", "Kiu Coates"],
  ...over,
});
const person = (over: Partial<CrmPerson> = {}): CrmPerson => ({
  pageId: "page-kiu",
  name: "Kiu Cortes",
  email: "Kiu@KiuCoates.com ",
  lastTouch: "2026-08-21",
  sessions: 1,
  ...over,
});
const alice = person({ pageId: "page-alice", name: "Alice Lenhardt ", email: null, sessions: 0 });

describe("speakersIn", () => {
  it("reads who spoke from the transcript's speaker labels, and nothing from bullet points", () => {
    const t =
      "Marcus Börner: Um\nAlice Lenhardt: Yeah.\nMarcus Börner: and\n" +
      "* Accelerator Tests: Marcus and Alice discussed\nNext steps\n00:14:02\nD'Arcy O-Neil: Right.";
    expect(speakersIn(t)).toEqual(["Marcus Börner", "Alice Lenhardt", "D'Arcy O-Neil"]);
  });
});

describe("matchCall", () => {
  it("matches an address on the invite, whatever its case or spacing", () => {
    const m = matchCall(call(), [person()]);
    expect(m.matches).toEqual([{ person: person(), why: "email" }]);
  });

  it("matches a full name as a speaker, folding case, accents and stray spaces", () => {
    const m = matchCall(call({ attendees: [], speakers: ["alice  lenhardt"] }), [alice]);
    expect(m.matches.map((x) => [x.person.pageId, x.why])).toEqual([["page-alice", "speaker"]]);
  });

  it("never matches a name that is only talked about, and reports a first name in the invite as possible", () => {
    const m = matchCall(
      call({
        attendees: ["someone@else.com"],
        speakers: ["Mark Oldenburg"],
        summary: "Mark said Kiu Cortes liked it.",
      }),
      [person({ email: "other@kiu.com" })]
    );
    expect(m.matches).toEqual([]);
    expect(m.near.map((p) => p.name)).toEqual(["Kiu Cortes"]);
  });

  it("does not call a teammate who shares a first name a possible match", () => {
    const m = matchCall(
      call({ attendees: [], eventTitle: "LoveIQ Sync", speakers: ["Mark Oldenburg"] }),
      [person({ name: "Mark Smith", email: null })]
    );
    expect(m).toEqual({ matches: [], near: [] });
    // A first name under three letters is too common a word to count.
    expect(
      matchCall(call({ attendees: [], eventTitle: "Call with Al" }), [
        person({ name: "Al B", email: null }),
      ]).near
    ).toEqual([]);
  });
});

describe("planFiling", () => {
  it("files a first call as a discovery interview and a second as a follow-up", () => {
    const p = person({ sessions: 0, lastTouch: null });
    const plan = planFiling(
      [call({ date: "2026-09-29", url: "u2" }), call({ date: "2026-09-10", url: "u1" })],
      [p],
      []
    );
    expect(plan.filings.map((f) => [f.call.date, f.type])).toEqual([
      ["2026-09-29", "Follow-up"],
      ["2026-09-10", "Discovery interview"],
    ]);
  });

  it("leaves a call already filed, and a person who already has a session row that day", () => {
    const sessions: SessionRow[] = [
      {
        therapists: ["page-x"],
        date: null,
        notesLink: "https://docs.google.com/document/d/NOTES1/edit",
      },
      { therapists: ["page-alice"], date: "2026-08-21", notesLink: null },
    ];
    const plan = planFiling(
      [
        call(),
        call({
          docId: "doc:2",
          url: "u-alice",
          date: "2026-08-21",
          attendees: [],
          speakers: ["Alice Lenhardt"],
        }),
      ],
      [person(), alice],
      sessions
    );
    expect(plan.filings).toEqual([]);
    expect(plan.skips.map((s) => s.reason)).toEqual([
      "already filed",
      "already has a session row on 2026-08-21",
    ]);
  });

  it("files a new call for someone whose earlier session was on another day", () => {
    const plan = planFiling(
      [call()],
      [person()],
      [{ therapists: ["page-kiu"], date: "2026-08-21", notesLink: "https://docs.google.com/x" }]
    );
    expect(plan.filings.map((f) => f.call.date)).toEqual(["2026-09-29"]);
  });

  it("puts everyone from the board who was on one call into one row", () => {
    const plan = planFiling(
      [call({ speakers: ["Alice Lenhardt", "Kiu Coates"] })],
      [person(), alice],
      []
    );
    expect(plan.filings).toHaveLength(1);
    expect(plan.filings[0]!.people.map((p) => p.pageId)).toEqual(["page-kiu", "page-alice"]);
    expect(plan.filings[0]!.why).toEqual(["email", "speaker"]);
    // Kiu has a session already, so this is a follow-up for the row.
    expect(plan.filings[0]!.type).toBe("Follow-up");
  });
});

describe("what a row carries", () => {
  it("keeps what the notes say and drops Gemini's own prompts", () => {
    const body = sessionBody(
      call({
        summary:
          "Summary\nThey liked it.\n\n\n\nLet us know what you think: Helpful or Not Helpful\n" +
          "Please rate the new Quick notes tab by taking a short survey.\nMeeting records Transcript",
      })
    );
    expect(
      body.startsWith("Filed from the Gemini notes of this call: https://docs.google.com/")
    ).toBe(true);
    expect(body).toContain("Summary\nThey liked it.");
    expect(body).not.toMatch(/Helpful or Not Helpful|Quick notes|Meeting records/);
    expect(nextStepsOf(call())).toBe(
      "[Mark Oldenburg] Send pricing: Send the pricing deck by Friday."
    );
  });
});

describe("fileCrmCalls", () => {
  const deps = (over: Partial<CrmDeps> = {}): CrmDeps => ({
    calls: async () => [call()],
    crm: async () => ({ people: [person()], sessions: [] }),
    create: vi.fn(async () => ({ url: "https://notion.so/row", droppedBlocks: 0 })),
    touch: vi.fn(async () => undefined),
    ...over,
  });

  it("writes nothing on a dry run", async () => {
    const d = deps();
    const r = await fileCrmCalls("2026-09-15", true, d);
    expect(r.filed.map((f) => f.people[0]!.name)).toEqual(["Kiu Cortes"]);
    expect(d.create).not.toHaveBeenCalled();
    expect(d.touch).not.toHaveBeenCalled();
  });

  it("files the row linked to the person, and moves Last touch only forward", async () => {
    const d = deps();
    const r = await fileCrmCalls("2026-09-15", false, d);
    expect(d.create).toHaveBeenCalledWith({
      parent: "Feedback Sessions",
      title: "Kiu Cortes - Follow-up",
      content: expect.stringContaining("They liked the report."),
      properties: {
        Date: "2026-09-29",
        Format: "Video call",
        "Session type": "Follow-up",
        "Notes link": "https://docs.google.com/document/d/NOTES1/edit",
        "Next step": "[Mark Oldenburg] Send pricing: Send the pricing deck by Friday.",
      },
      rawProperties: { Therapist: { relation: [{ id: "page-kiu" }] } },
    });
    expect(d.touch).toHaveBeenCalledWith("page-kiu", "2026-09-29");
    expect(r.filed[0]!.url).toBe("https://notion.so/row");
    const later = deps({
      crm: async () => ({ people: [person({ lastTouch: "2026-10-01" })], sessions: [] }),
    });
    await fileCrmCalls("2026-09-15", false, later);
    expect(later.touch).not.toHaveBeenCalled();
  });

  it("says what failed: a row Notion refused, a Last touch it could not move, and what it could not read", async () => {
    const refused = await fileCrmCalls(
      "2026-09-15",
      false,
      deps({ create: async () => Promise.reject(new Error("validation_error")) })
    );
    expect(refused.filed[0]).toMatchObject({ error: "validation_error" });
    const untouched = await fileCrmCalls(
      "2026-09-15",
      false,
      deps({ touch: async () => Promise.reject(new Error("nope")) })
    );
    expect(untouched.filed[0]).toMatchObject({
      url: "https://notion.so/row",
      untouched: ["Kiu Cortes"],
    });
    const unread = await fileCrmCalls(
      "2026-09-15",
      false,
      deps({ calls: async () => null, crm: async () => null })
    );
    expect(unread.gaps).toEqual([
      "The meeting notes could not be read.",
      'The Notion boards "Therapists & Coaches" and "Feedback Sessions" could not be read.',
    ]);
  });
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe("readCalls", () => {
  beforeEach(() => {
    mockSupabaseFetch.mockReset();
  });

  it("puts each notes document together with the invite it links to", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce(
        ok([
          {
            source_id: "doc:1#2",
            title:
              "Meeting notes: 60 min with Mark (Kiu Coates) - 2026/09/29 11:00 CEST - Notes by Gemini (part 2 of 2)",
            url: "https://docs.google.com/document/d/NOTES1/edit",
            body: "Kiu Coates: Hello.\nMark Oldenburg: Hi.",
            period_end: "2026-09-29",
            meta: {
              section: "transcript",
              part: 2,
              links: ["calendar/event:abc@google.com:2026-09-29"],
            },
          },
          {
            source_id: "doc:1",
            title:
              "Meeting notes: 60 min with Mark (Kiu Coates) - 2026/09/29 11:00 CEST - Notes by Gemini",
            url: "https://docs.google.com/document/d/NOTES1/edit",
            // A summary line that happens to start with a name is not someone speaking.
            body: "Summary\nThey liked it.\nAlice Lenhardt: was mentioned in passing.",
            period_end: "2026-09-29",
            meta: { section: "summary", links: ["calendar/event:abc@google.com:2026-09-29"] },
          },
        ])
      )
      .mockResolvedValueOnce(
        ok([
          {
            source_id: "event:abc@google.com:2026-09-29",
            title: "Meeting: 60 min with Mark (Kiu Coates)",
            meta: { attendees: ["kiu@kiucoates.com", "mo@loveiq.org"] },
          },
        ])
      );
    expect(await readCalls("2026-09-15")).toEqual([
      {
        docId: "doc:1",
        title: "60 min with Mark (Kiu Coates) - 2026/09/29 11:00 CEST - Notes by Gemini",
        url: "https://docs.google.com/document/d/NOTES1/edit",
        date: "2026-09-29",
        summary: "Summary\nThey liked it.\nAlice Lenhardt: was mentioned in passing.",
        attendees: ["kiu@kiucoates.com", "mo@loveiq.org"],
        eventTitle: "60 min with Mark (Kiu Coates)",
        speakers: ["Kiu Coates", "Mark Oldenburg"],
      },
    ]);
    const lookup = String(mockSupabaseFetch.mock.calls[1]![0]);
    expect(lookup).toContain(
      `source_id=in.(%22${encodeURIComponent("event:abc@google.com:2026-09-29")}%22)`
    );
  });

  it("returns null when the notes or the invites cannot be read, never a shorter list", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    expect(await readCalls("2026-09-15")).toBeNull();
    mockSupabaseFetch
      .mockResolvedValueOnce(
        ok([
          {
            source_id: "doc:1",
            title: "t",
            url: "u",
            body: "",
            period_end: "2026-09-29",
            meta: { links: ["calendar/e"] },
          },
        ])
      )
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    expect(await readCalls("2026-09-15")).toBeNull();
  });
});

describe("readCrm", () => {
  it("reads people and their sessions off the live boards", async () => {
    mockResolve.mockImplementation(async (name: string) => ({
      id: name === "Therapists & Coaches" ? "db-people" : "db-sessions",
      titleProperty: name === "Therapists & Coaches" ? "Name" : "Session",
    }));
    mockQuery.mockImplementation(async (id: string) =>
      id === "db-people"
        ? [
            {
              id: "page-kiu",
              properties: {
                Name: { title: [{ plain_text: "Kiu " }, { plain_text: "Cortes" }] },
                Email: { email: "kiu@kiucoates.com" },
                "Last touch": { date: { start: "2026-08-21" } },
                "Feedback Sessions": { relation: [{ id: "s1" }] },
              },
            },
          ]
        : [
            {
              id: "s1",
              properties: {
                Therapist: { relation: [{ id: "page-kiu" }] },
                Date: { date: null },
                "Notes link": { url: null },
              },
            },
          ]
    );
    expect(await readCrm()).toEqual({
      people: [
        {
          pageId: "page-kiu",
          name: "Kiu Cortes",
          email: "kiu@kiucoates.com",
          lastTouch: "2026-08-21",
          sessions: 1,
        },
      ],
      sessions: [{ therapists: ["page-kiu"], date: null, notesLink: null }],
    });
  });
});

describe("renderCrmCalls", () => {
  const plan = planFiling([call()], [person()], []);
  const result = { calls: 3, filed: plan.filings, skips: [], near: [], gaps: [] };

  it("says a dry run wrote nothing, and names the match and the type", () => {
    const text = renderCrmCalls(result, true, "2026-09-15");
    expect(text).toContain("Recorded calls since 2026-09-15: 3.");
    expect(text).toContain("Would file (nothing was written; pass dry_run: false to file):");
    expect(text).toContain(
      '- 2026-09-29 "60 min with Mark (Kiu Coates)" → Kiu Cortes (matched by their email), as Follow-up'
    );
  });

  it("links what it filed, says what it left alone and what nearly matched, and what it could not read", () => {
    const text = renderCrmCalls(
      {
        calls: 3,
        filed: [{ ...plan.filings[0]!, url: "https://notion.so/row", untouched: ["Kiu Cortes"] }],
        skips: [
          {
            call: call({ date: "2026-08-21", eventTitle: null, title: "Meeting started" }),
            people: [alice],
            reason: "already has a session row on 2026-08-21",
          },
        ],
        near: [{ call: call(), person: person() }],
        gaps: ["The meeting notes could not be read."],
      },
      false,
      "2026-09-15"
    );
    expect(text).toContain("Filed:\n- 2026-09-29");
    expect(text).toContain("→ https://notion.so/row (Last touch not updated for Kiu Cortes)");
    expect(text).toContain(
      '- 2026-08-21 "Meeting started" → Alice Lenhardt: already has a session row on 2026-08-21.'
    );
    expect(text).toContain(
      "might be Kiu Cortes. Add their email to the Notion row, or correct the name"
    );
    expect(text).toContain("Not read: The meeting notes could not be read.");
    expect(
      renderCrmCalls({ calls: 0, filed: [], skips: [], near: [], gaps: [] }, false, "x")
    ).toContain("Nothing new to file.");
  });
});
