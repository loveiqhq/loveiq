import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...(a as [])),
}));
const mockFetch = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => mockFetch(...(a as [])),
}));
const mockDelegated = vi.fn();
vi.mock("@shared/http/google-oauth", () => ({
  DRIVE_SCOPE: "drive.readonly",
  getDelegatedToken: (...a: unknown[]) => mockDelegated(...(a as [])),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  commentAsks,
  figmaAsks,
  figmaFiles,
  figmaLink,
  figmaMailNames,
  googleStatus,
  googleThreads,
  liveDeps,
  makePersonOf,
  mentionsIn,
  parseGoogleAsks,
  renderAsks,
  GOOGLE_LOOKUPS,
  type AskDeps,
  type CommentAsk,
  type FigmaComment,
} from "@features/brain/server/comment-asks";

const personOf = makePersonOf(
  new Map([
    ["sk@loveiq.org", "Sanjin Kacevac"],
    ["mb@loveiq.org", "Marcus Börner"],
    ["marcus börner", "Marcus Börner"],
  ]),
  ["Mark Oldenburg", "Sanjin Kacevac", "Marcus Börner", "Eman Cickusic", "Fatih Hadzic"]
);
const HANDLES = ["Mark", "Sanjin", "Marcus Börner", "Eman", "Fatih Hadžić"];

const fc = (over: Partial<FigmaComment> & { id: string }): FigmaComment => ({
  parent_id: "",
  message: "",
  created_at: "2026-09-20T10:00:00Z",
  resolved_at: null,
  user: { handle: "Mark" },
  client_meta: { node_id: "334:829" },
  ...over,
});

describe("makePersonOf", () => {
  it("uses the registry first, then a first name only one person has, and otherwise the name as given", () => {
    expect(personOf("sk@loveiq.org")).toBe("Sanjin Kacevac");
    expect(personOf("Mark")).toBe("Mark Oldenburg");
    expect(personOf("Fatih Hadžić")).toBe("Fatih Hadzic");
    const twoMarks = makePersonOf(new Map(), ["Mark Oldenburg", "Mark Twain"]);
    expect(twoMarks("Mark")).toBe("Mark");
    expect(personOf("Admin")).toBe("Admin");
  });
});

describe("mentionsIn", () => {
  it("takes the longest handle at each @, stops at a word boundary, ignores case and repeats", () => {
    expect(mentionsIn("@Marcus Börner @Sanjin What do we think?", [...HANDLES, "Marcus"])).toEqual([
      "Marcus Börner",
      "Sanjin",
    ]);
    expect(mentionsIn("@Markus please look", HANDLES)).toEqual([]);
    expect(mentionsIn("@mark, i really like this", HANDLES)).toEqual(["Mark"]);
    expect(mentionsIn("@Eman \n@Eman Ready for staging", HANDLES)).toEqual(["Eman"]);
    expect(mentionsIn("mail me at a@b.com", HANDLES)).toEqual([]);
  });
});

describe("figmaAsks", () => {
  const run = (comments: FigmaComment[], since = "2026-09-01") =>
    figmaAsks("KEY123", "Report 3.0", comments, since, personOf, HANDLES);

  it("makes one ask per person a comment mentions, never the asker, with a link to the comment", () => {
    const asks = run([fc({ id: "1", message: "@Sanjin @Marcus Börner @Mark What do we think?" })]);
    expect(asks.map((a) => a.person)).toEqual(["Sanjin Kacevac", "Marcus Börner"]);
    expect(asks[0]).toMatchObject({
      asker: "Mark Oldenburg",
      app: "Figma",
      file: "Report 3.0",
      day: "2026-09-20",
      status: "open",
      link: "https://www.figma.com/design/KEY123?node-id=334-829#1",
    });
  });

  it("leaves out comments before the period", () => {
    expect(
      run([fc({ id: "1", message: "@Sanjin hi", created_at: "2026-08-01T10:00:00Z" })])
    ).toEqual([]);
  });

  it("reads resolved off the thread's root, since Figma resolves threads, not replies", () => {
    const asks = run([
      fc({ id: "1", message: "Header copy", resolved_at: "2026-09-21T09:00:00Z" }),
      fc({
        id: "2",
        parent_id: "1",
        message: "@Sanjin please shorten",
        created_at: "2026-09-20T11:00:00Z",
      }),
    ]);
    expect(asks).toHaveLength(1);
    expect(asks[0]!.status).toBe("resolved");
    expect(asks[0]!.link).toBe("https://www.figma.com/design/KEY123?node-id=334-829#1");
  });

  it("calls it answered only when the person asked replied after the ask", () => {
    const base = fc({
      id: "1",
      message: "@Sanjin can you review?",
      created_at: "2026-09-20T10:00:00Z",
    });
    const before = fc({
      id: "2",
      parent_id: "1",
      user: { handle: "Sanjin" },
      message: "earlier",
      created_at: "2026-09-20T09:00:00Z",
    });
    const after = fc({
      id: "3",
      parent_id: "1",
      user: { handle: "Sanjin" },
      message: "Done",
      created_at: "2026-09-22T08:00:00Z",
    });
    const other = fc({
      id: "4",
      parent_id: "1",
      user: { handle: "Eman" },
      message: "+1",
      created_at: "2026-09-21T08:00:00Z",
    });
    expect(run([base, before, other])[0]!.status).toBe("open");
    expect(run([base, after])[0]).toMatchObject({ status: "answered", answeredOn: "2026-09-22" });
  });

  it("gives a bare ping the thread it lands in as context", () => {
    const asks = run([
      fc({ id: "1", message: "Should the paywall move up?", user: { handle: "Eman" } }),
      fc({
        id: "2",
        parent_id: "1",
        message: "@Mark , @Sanjin",
        created_at: "2026-09-20T12:00:00Z",
      }),
    ]);
    expect(asks.map((a) => a.context)).toEqual(["Should the paywall move up?"]);
    expect(run([fc({ id: "9", message: "@Sanjin" })])[0]!.context).toBeUndefined();
  });
});

describe("figmaLink", () => {
  it("points at the thread's root, on its node when it has one", () => {
    expect(figmaLink("K", fc({ id: "5", parent_id: "2", client_meta: null }))).toBe(
      "https://www.figma.com/design/K#2"
    );
  });
});

const ASSIGNED = [
  "Email: Applied_Psychomet... - @eman.cickusic@loveiq.org , can you c...",
  "Between: Marcus Börner (Google Docs), ec@loveiq.org",
  "",
  "Marcus Börner (Google Docs) (2026-09-07): Marcus Börner (mb@loveiq.org) assigned you an action item in the following",
  "document",
  "Applied_Psychometrics_Chief_of_Staff_Internship",
  "(https://docs.google.com/document/d/1NBpXjcP-JlKw0yGstyiiBfGo0HH0obQKKt0yLaoeKeU/edit?disco=AAACGuhz_Cc&usp=comment_email_document&ts=6a9e594b&usp_dm=false&tab=t.0)",
  "",
  "1 comment",
  "",
  ".",
  "Marcus Börner",
  "| hr@loveiq.org",
  "@eman.cickusic@loveiq.org , can you create this email and add the team as a",
  "group :)",
  "_Assigned to you_",
  "",
  "Open",
  "(https://docs.google.com/document/d/1NBpXjcP-JlKw0yGstyiiBfGo0HH0obQKKt0yLaoeKeU/edit?disco=AAACGuhz_Cc&usp=todo_email_discussion)",
].join("\n");

const MENTIONED = [
  "Mark Oldenburg (Google Docs) (2026-09-22): Mark Oldenburg (mo@loveiq.org) mentioned you in a comment in the following",
  "document",
  "Spark_Seeker_How_to_improve",
  "(https://docs.google.com/document/d/1OLgsKf8KEWNGT6Ox-dDv1TEPPU_mw0eEvJ0eBulqDRI/edit?disco=AAACHc4wfD4&usp=comment_email_document)",
  "[Shared externally]",
  "",
  "1 comment",
  "",
  ".",
  "Mark Oldenburg",
  "| Notice the moment the state changes. Instead of judging desire globally",
  "as high or",
  "@sk@loveiq.org",
  "We need to have line breaks after the bold text.",
  "",
  "Open",
  "(https://docs.google.com/document/d/1OLgsKf8KEWNGT6Ox-dDv1TEPPU_mw0eEvJ0eBulqDRI/edit?disco=AAACHc4wfD4)",
].join("\n");

describe("parseGoogleAsks", () => {
  it("reads an assigned action item and a mention, with the document and the comment's id", () => {
    expect(parseGoogleAsks(`${ASSIGNED}\n\n${MENTIONED}`, "ec@loveiq.org")).toEqual([
      expect.objectContaining({
        recipient: "ec@loveiq.org",
        asker: "Marcus Börner",
        app: "Google Docs",
        kind: "action item",
        file: "Applied_Psychometrics_Chief_of_Staff_Internship",
        fileId: "1NBpXjcP-JlKw0yGstyiiBfGo0HH0obQKKt0yLaoeKeU",
        commentId: "AAACGuhz_Cc",
        day: "2026-09-07",
        text: "@eman.cickusic@loveiq.org , can you create this email and add the team as a group :)",
      }),
      expect.objectContaining({
        asker: "Mark Oldenburg",
        kind: "mention",
        file: "Spark_Seeker_How_to_improve",
        commentId: "AAACHc4wfD4",
        text: "@sk@loveiq.org We need to have line breaks after the bold text.",
      }),
    ]);
  });

  it("skips a notification whose link carries no comment id", () => {
    expect(parseGoogleAsks(ASSIGNED.replace(/disco=AAACGuhz_Cc&/g, ""), "ec@loveiq.org")).toEqual(
      []
    );
  });
});

describe("googleStatus", () => {
  it("reads deleted, resolved, answered by the person asked (after the ask), and open", () => {
    const at = "2026-09-20T10:00:00Z";
    expect(googleStatus({ deleted: true, resolved: false })).toEqual({ status: "gone" });
    expect(googleStatus({ resolved: true })).toEqual({ status: "resolved" });
    expect(
      googleStatus({
        createdTime: at,
        replies: [{ author: { me: true }, createdTime: "2026-09-21T08:00:00Z" }],
      })
    ).toEqual({ status: "answered", answeredOn: "2026-09-21" });
    expect(
      googleStatus({
        createdTime: at,
        replies: [
          { author: { me: false }, createdTime: "2026-09-21T08:00:00Z" },
          { author: { me: true }, createdTime: "2026-09-19T08:00:00Z" },
        ],
      })
    ).toEqual({ status: "open" });
  });
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe("the corpus reads", () => {
  beforeEach(() => mockSupabaseFetch.mockReset());

  it("finds Figma files by the links shared anywhere, name from the slug", async () => {
    mockSupabaseFetch.mockResolvedValueOnce(
      ok([
        {
          body: "see https://www.figma.com/design/VpDMMtuN0JkxlMxQZDg86k/Report-3.0?node-id=1-2 and",
        },
        {
          body: "https://www.figma.com/file/IdxyUUVvJSYRTpI9CYRtJI/LoveIQ?x=1 https://www.figma.com/design/hkFVs7r1ewoSJFuYq8p66m/Nikolina-%C4%90oki%C4%87---Tasks",
        },
      ])
    );
    expect([...(await figmaFiles())!]).toEqual([
      ["VpDMMtuN0JkxlMxQZDg86k", "Report 3.0"],
      ["IdxyUUVvJSYRTpI9CYRtJI", "LoveIQ"],
      ["hkFVs7r1ewoSJFuYq8p66m", "Nikolina Đokić   Tasks"],
    ]);
  });

  it("keeps a renamed file's newest name, the first one read", async () => {
    mockSupabaseFetch.mockResolvedValueOnce(
      ok([
        { body: "https://www.figma.com/design/VpDMMtuN0JkxlMxQZDg86k/Report-3.0" },
        { body: "https://www.figma.com/design/VpDMMtuN0JkxlMxQZDg86k/Report-2.0-draft" },
      ])
    );
    expect([...(await figmaFiles())!]).toEqual([["VpDMMtuN0JkxlMxQZDg86k", "Report 3.0"]]);
    expect(String(mockSupabaseFetch.mock.calls[0]![0])).toContain("order=period_end.desc");
  });

  it("reads every page, so a busy corpus never drops the oldest links, and fails whole", async () => {
    const page = Array.from({ length: 1000 }, () => ({ body: "nothing here" }));
    mockSupabaseFetch
      .mockResolvedValueOnce(ok(page))
      .mockResolvedValueOnce(
        ok([{ body: "https://www.figma.com/board/Bq2w3e4r5t6y7u8i9o0p1a/Team-Retro" }])
      );
    expect([...(await figmaFiles())!]).toEqual([["Bq2w3e4r5t6y7u8i9o0p1a", "Team Retro"]]);
    expect(String(mockSupabaseFetch.mock.calls[1]![0])).toContain("&offset=1000");
    // Through the fts index: a substring scan of every body timed out in production.
    expect(String(mockSupabaseFetch.mock.calls[0]![0])).toContain(
      `fts=fts(simple).${encodeURIComponent("www.figma.com | figma.com")}`
    );
    expect(String(mockSupabaseFetch.mock.calls[0]![0])).not.toContain("body=ilike");
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    expect(await figmaFiles()).toBeNull();
    // Past the ceiling the read is partial, and a partial read must not pass for the whole.
    mockSupabaseFetch.mockReset().mockResolvedValue(ok(page));
    expect(await googleThreads("2026-09-01")).toBeNull();
  });

  it("names the files Figma's own emails mention, and only Figma's", async () => {
    mockSupabaseFetch.mockResolvedValueOnce(
      ok([
        { title: "Email: Mark mentioned you in Report 3.0 (part 2 of 5)" },
        { title: "Email: 2 new comments in LoveIQ" },
        { title: "Email: Eman left a comment in New File" },
      ])
    );
    expect(await figmaMailNames("2026-09-01")).toEqual(["Report 3.0", "LoveIQ", "New File"]);
    expect(String(mockSupabaseFetch.mock.calls[0]![0])).toContain(
      "Figma%20is%20a%20design%20platform"
    );
    expect(String(mockSupabaseFetch.mock.calls[0]![0])).toContain("&fts=fts(english).figma");
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    expect(await figmaMailNames("2026-09-01")).toBeNull();
  });

  it("joins a thread's parts in order, and reports an unreadable corpus as null", async () => {
    mockSupabaseFetch.mockResolvedValueOnce(
      ok([
        { source_id: "thread:a#2", body: "second", meta: { mailbox: "sk@loveiq.org" } },
        { source_id: "thread:a", body: "first", meta: { mailbox: "sk@loveiq.org" } },
      ])
    );
    expect(await googleThreads("2026-09-01")).toEqual([
      { mailbox: "sk@loveiq.org", text: "first\n\nsecond" },
    ]);
    expect(String(mockSupabaseFetch.mock.calls[0]![0])).toContain(
      `&fts=fts(english).${encodeURIComponent("(assigned & action & item) | (mentioned & comment)")}`
    );
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    expect(await googleThreads("2026-09-01")).toBeNull();
  });
});

describe("commentAsks", () => {
  const deps = (over: Partial<AskDeps> = {}): AskDeps => ({
    figmaFiles: async () => new Map([["KEY", "Report 3.0"]]),
    figmaMailNames: async () => ["Report 3.0"],
    figmaComments: async () => [fc({ id: "1", message: "@Sanjin please review" })],
    googleThreads: async () => [{ mailbox: "ec@loveiq.org", text: ASSIGNED }],
    googleComment: async () => ({
      resolved: false,
      content: "@eman can you create this email",
      createdTime: "2026-09-07T10:00:00Z",
    }),
    people: async () => ({
      aliases: new Map([
        ["ec@loveiq.org", "Eman Cickusic"],
        ["sk@loveiq.org", "Sanjin Kacevac"],
      ]),
      canonicals: ["Mark Oldenburg", "Sanjin Kacevac", "Eman Cickusic", "Marcus Börner"],
    }),
    ...over,
  });

  it("puts Figma and Google asks together, Google text from Drive, with no gaps when all was read", async () => {
    const r = await commentAsks("2026-09-01", deps());
    expect(r.gaps).toEqual([]);
    expect(r.asks.map((a) => [a.app, a.person, a.asker, a.status])).toEqual([
      ["Figma", "Sanjin Kacevac", "Mark Oldenburg", "open"],
      ["Google Docs", "Eman Cickusic", "Marcus Börner", "open"],
    ]);
    expect(r.asks[1]!.text).toBe("@eman can you create this email");
  });

  it("says what it could not read instead of showing less", async () => {
    const r = await commentAsks(
      "2026-09-01",
      deps({
        figmaComments: async () => null,
        figmaMailNames: async () => ["Report 3.0", "Secret File"],
        googleThreads: async () => null,
      })
    );
    expect(r.gaps.join(" ")).toContain("These Figma files could not be read: Report 3.0.");
    expect(r.gaps.join(" ")).toContain("Secret File");
    expect(r.gaps.join(" ")).toContain("Google comment emails could not be read");
    const none = await commentAsks("2026-09-01", deps({ figmaFiles: async () => new Map() }));
    expect(none.gaps.join(" ")).toContain("No Figma file links were found");
    const failed = await commentAsks(
      "2026-09-01",
      deps({ figmaFiles: async () => null, figmaMailNames: async () => null })
    );
    expect(failed.gaps.join(" ")).toContain("The list of Figma files could not be read");
    expect(failed.gaps.join(" ")).toContain("Figma's emails could not be checked");
    expect(failed.gaps.join(" ")).not.toContain("No Figma file links were found");
  });

  /** Seen live: the slug "Nikolina-%C4%90oki%C4%87---Tasks" against the email's "Nikolina Đokić - Tasks". */
  it("matches a file's email name to its link however each spells the punctuation", async () => {
    const r = await commentAsks(
      "2026-09-01",
      deps({
        figmaFiles: async () => new Map([["KEY", "Nikolina Đokić   Tasks"]]),
        figmaMailNames: async () => ["Nikolina Đokić - Tasks"],
      })
    );
    expect(r.gaps).toEqual([]);
  });

  it("keeps the email's own text when Drive cannot be read", async () => {
    const r = await commentAsks("2026-09-01", deps({ googleComment: async () => null }));
    expect(r.asks.find((a) => a.app === "Google Docs")!.text).toBe(
      "@eman.cickusic@loveiq.org , can you create this email and add the team as a group :)"
    );
    // A reply's email has no line starting with "@"; Google's sharing banner is not the ask.
    const reply = MENTIONED.replace("@sk@loveiq.org\n", "");
    const r2 = await commentAsks(
      "2026-09-01",
      deps({
        googleThreads: async () => [{ mailbox: "sk@loveiq.org", text: reply }],
        googleComment: async () => null,
      })
    );
    expect(r2.asks.find((a) => a.app === "Google Docs")!.text).not.toContain("Shared externally");
  });

  it("leaves out a Google ask to oneself", async () => {
    const self = ASSIGNED.replace(
      "Marcus Börner (mb@loveiq.org)",
      "Eman Cickusic (ec@loveiq.org)"
    ).replace("Marcus Börner (Google Docs) (", "Eman Cickusic (Google Docs) (");
    const r = await commentAsks(
      "2026-09-01",
      deps({ googleThreads: async () => [{ mailbox: "ec@loveiq.org", text: self }] })
    );
    expect(r.asks.filter((a) => a.app === "Google Docs")).toEqual([]);
  });

  it("counts a mention of someone on the roster who has never commented in these files", async () => {
    const r = await commentAsks(
      "2026-09-01",
      deps({
        figmaComments: async () => [fc({ id: "1", message: "@Marcus Börner please look" })],
        googleThreads: async () => [],
      })
    );
    expect(r.asks.map((a) => a.person)).toEqual(["Marcus Börner"]);
  });

  it("marks a Google ask it could not check as unknown, never open, and checks each comment once per person", async () => {
    const twice = { mailbox: "ec@loveiq.org", text: `${ASSIGNED}\n\n${ASSIGNED}` };
    const google = vi.fn(async () => null);
    const r = await commentAsks(
      "2026-09-01",
      deps({ googleThreads: async () => [twice], googleComment: google })
    );
    expect(google).toHaveBeenCalledTimes(1);
    expect(r.asks.filter((a) => a.app !== "Figma").map((a) => a.status)).toEqual(["unknown"]);
  });

  it("checks at most the cap live and says so", async () => {
    const many = Array.from({ length: GOOGLE_LOOKUPS + 2 }, (_, i) => ({
      mailbox: "ec@loveiq.org",
      text: ASSIGNED.replace(/AAACGuhz_Cc/g, `C${i}`),
    }));
    const google = vi.fn(async () => ({ resolved: true }));
    const r = await commentAsks(
      "2026-09-01",
      deps({ googleThreads: async () => many, googleComment: google })
    );
    expect(google).toHaveBeenCalledTimes(GOOGLE_LOOKUPS);
    expect(r.asks.filter((a) => a.status === "unknown")).toHaveLength(2);
    expect(r.gaps.join(" ")).toContain(
      `Only the newest ${GOOGLE_LOOKUPS} of ${GOOGLE_LOOKUPS + 2}`
    );
  });

  it("checks the newest first, so the cap leaves out the oldest", async () => {
    const day = (i: number) => `2026-09-${String(10 + (i % 15)).padStart(2, "0")}`;
    const many = Array.from({ length: GOOGLE_LOOKUPS + 2 }, (_, i) => ({
      mailbox: "ec@loveiq.org",
      text: ASSIGNED.replace(/AAACGuhz_Cc/g, `C${i}`).replace("(2026-09-07)", `(${day(i)})`),
    }));
    const r = await commentAsks(
      "2026-09-01",
      deps({ googleThreads: async () => many, googleComment: async () => ({ resolved: true }) })
    );
    const unknown = r.asks.filter((a) => a.status === "unknown").map((a) => a.day);
    const checked = r.asks.filter((a) => a.status === "resolved").map((a) => a.day);
    expect(unknown).toHaveLength(2);
    expect(unknown.every((d) => checked.every((c) => d <= c))).toBe(true);
  });

  it("drops a Google ask older than the period even inside a recent thread", async () => {
    const r = await commentAsks("2026-09-10", deps({ figmaComments: async () => [] }));
    expect(r.asks).toEqual([]);
  });
});

describe("renderAsks", () => {
  const ask = (over: Partial<CommentAsk>): CommentAsk => ({
    person: "Sanjin Kacevac",
    asker: "Mark Oldenburg",
    app: "Figma",
    kind: "mention",
    file: "Report 3.0",
    text: "@Sanjin review",
    day: "2026-09-20",
    link: "https://www.figma.com/design/K#1",
    status: "open",
    ...over,
  });
  const result = {
    gaps: [],
    asks: [
      ask({ status: "answered", answeredOn: "2026-09-22", day: "2026-09-19" }),
      ask({}),
      ask({ status: "resolved" }),
      ask({ person: "Marcus Börner", status: "unknown", app: "Google Docs", kind: "action item" }),
    ],
  };

  it("groups by person, open first, and leaves resolved out with a count", () => {
    const out = renderAsks(result, null, false);
    expect(out).toMatch(
      /^Sanjin Kacevac: 1 open of 2 shown\n- 2026-09-20 Figma · Report 3.0 · Mark Oldenburg: "@Sanjin review" → open/
    );
    expect(out).toContain("→ answered by them on 2026-09-22, not resolved");
    expect(out).toContain("Marcus Börner: 0 open of 1 shown");
    expect(out).toContain("(action item)");
    expect(out).toContain("status unknown (the source could not be checked)");
    expect(out).toContain("Resolved or deleted, left out: 1.");
  });

  it("filters to a person by full name or first name, and lists resolved on request", () => {
    expect(renderAsks(result, "Marcus", false)).not.toContain("Sanjin Kacevac:");
    expect(renderAsks(result, "marcus börner", false)).toContain(
      "Marcus Börner: 0 open of 1 shown"
    );
    expect(renderAsks(result, "Sanjin Kacevac", true)).toContain("→ resolved");
  });

  it("matches a full name exactly, so one Marcus is not another", () => {
    const r = {
      gaps: [],
      asks: [ask({ person: "Marcus Börner" }), ask({ person: "Marcus Weber", text: "other" })],
    };
    const out = renderAsks(r, "Marcus Börner", false);
    expect(out).toContain("Marcus Börner: 1 open of 1 shown");
    expect(out).not.toContain("Marcus Weber");
    expect(renderAsks(r, "marcus", false)).toContain("Marcus Weber");
  });

  it("leaves a deleted comment out unless resolved ones are asked for", () => {
    const r = { gaps: [], asks: [ask({}), ask({ status: "gone", text: "deleted one" })] };
    const out = renderAsks(r, null, false);
    expect(out).not.toContain("deleted one");
    expect(out).toContain("Resolved or deleted, left out: 1.");
    expect(renderAsks(r, null, true)).toContain("deleted one");
  });

  it("says when nothing is open, or nothing was asked, and appends what was not read", () => {
    expect(renderAsks({ gaps: [], asks: [ask({ status: "resolved" })] }, null, false)).toBe(
      "Nothing open: the one ask in this period is resolved or deleted."
    );
    // In a list, what was not read comes first: a size ceiling cuts the end.
    expect(renderAsks({ gaps: ["X could not be read."], asks: [ask({})] }, null, false)).toMatch(
      /^Not read: X could not be read\.\n\n/
    );
    expect(renderAsks({ gaps: ["X could not be read."], asks: [] }, "Mark", false)).toBe(
      "No asks in Figma or Google comments for Mark in this period.\n\nNot read: X could not be read."
    );
  });
});

describe("liveDeps", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockDelegated.mockReset();
    delete process.env.FIGMA_TOKEN;
    delete process.env.FIGMA_ACCESS_TOKEN;
  });

  it("reads Figma's plain comments (markdown drops the @), and nothing without a token", async () => {
    const d = liveDeps(null);
    expect(await d.figmaComments("KEY")).toBeNull();
    process.env.FIGMA_TOKEN = "tok";
    mockFetch.mockResolvedValueOnce(ok({ comments: [fc({ id: "1" })] }));
    expect(await d.figmaComments("KEY")).toHaveLength(1);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.figma.com/v1/files/KEY/comments");
    expect(init.headers).toEqual({ "X-Figma-Token": "tok" });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
    expect(await d.figmaComments("KEY")).toBeNull();
  });

  it("reads a Google comment as the person asked, one token per person, and null on failure", async () => {
    mockDelegated.mockResolvedValue("gtok");
    mockFetch.mockResolvedValue(ok({ resolved: true }));
    const d = liveDeps("oidc-1");
    const a = parseGoogleAsks(ASSIGNED, "ec@loveiq.org")[0]!;
    expect(await d.googleComment(a)).toEqual({ resolved: true });
    await d.googleComment({ ...a, commentId: "OTHER" });
    expect(mockDelegated).toHaveBeenCalledTimes(1);
    expect(mockDelegated.mock.calls[0]).toEqual([
      "ec@loveiq.org",
      "drive.readonly",
      expect.any(Number),
      "oidc-1",
    ]);
    expect(String(mockFetch.mock.calls[0]![0])).toContain(
      "/files/1NBpXjcP-JlKw0yGstyiiBfGo0HH0obQKKt0yLaoeKeU/comments/AAACGuhz_Cc?fields="
    );
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    expect(await d.googleComment(a)).toBeNull();
    mockDelegated.mockResolvedValue(null);
    expect(await liveDeps(null).googleComment(a)).toBeNull();
  });
});
