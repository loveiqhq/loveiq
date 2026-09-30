/**
 * Full-text papers (features/brain/server/ingest/papers.ts): only CC BY and CC0 reach the
 * index, the license is read from the article itself, the text is the paper's prose and
 * nothing else, and every part says whose work it is.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let fetched: string[] = [];
let answer: (url: string) => Response | Promise<Response> = () => new Response("", { status: 500 });
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) => {
    fetched.push(url);
    return answer(url);
  }),
}));

let storedPages: Array<Response | (() => Response)> = [];
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async () => {
    const next = storedPages.shift();
    if (!next) return new Response("[]", { status: 200 });
    return typeof next === "function" ? next() : next;
  }),
}));

import { searchEvidence } from "@features/brain/server/ingest/evidence";
import {
  MAX_PAPERS_PER_RUN,
  MIN_TEXT_CHARS,
  articleLicense,
  articleText,
  buildPaperQuery,
  fetchArticle,
  ingestPapers,
  jatsToText,
  paperRows,
  partHead,
  searchPapers,
  storedPmcids,
  toPaperMeta,
  type PaperMeta,
} from "@features/brain/server/ingest/papers";
import { MAX_BODY_CHARS, type BrainRow } from "@features/brain/server/ingest/upsert";

const meta = (over: Partial<PaperMeta> = {}): PaperMeta => ({
  pmcid: "PMC8255964",
  title:
    "Associations of Intimacy, Partner Responsiveness, and Attachment-Related Emotional Needs With Sexual Desire",
  firstAuthor: "van Lankveld JJDM",
  authorCount: 4,
  journal: "Frontiers in psychology",
  year: "2021",
  doi: "10.3389/fpsyg.2021.665967",
  license: "cc by",
  ...over,
});

const permissions = (inner: string) =>
  `<article><front><permissions>${inner}</permissions></front>`;
const ccBy = (v = "4.0") =>
  permissions(
    `<license license-type="open-access" xlink:href="https://creativecommons.org/licenses/by/${v}/"><license-p>This is an open-access article.</license-p></license>`
  );

describe("the search asks only for papers we may store", () => {
  it("keeps the evidence gates and adds open access, full text and the two licenses", () => {
    const q = buildPaperQuery("Sexual Desire");
    expect(q).toContain('TITLE:"Sexual Desire"');
    expect(q).toContain("NOT TITLE_ABS:");
    expect(q).toContain("OPEN_ACCESS:y");
    expect(q).toContain("IN_EPMC:y");
    expect(q).toContain('(LICENSE:"cc by" OR LICENSE:"cc0")');
    // The evidence query is wrapped, so its NOT cannot swallow the clauses after it.
    expect(q.startsWith("(TITLE:")).toBe(true);
  });
});

describe("toPaperMeta checks the search's answer rather than trusting it", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    pmcid: "PMC1",
    title: "Desire &amp; arousal in couples.",
    license: "cc by",
    authorString: "Smith J, Doe A, Roe B.",
    pubYear: "2024",
    doi: "10.1/x",
    journalInfo: { journal: { title: "Journal of sex research" } },
    pubTypeList: { pubType: ["research-article", "Journal Article"] },
    ...over,
  });

  it("reads a CC BY paper: title decoded, full stop dropped, first author and count", () => {
    expect(toPaperMeta(row())).toEqual({
      pmcid: "PMC1",
      title: "Desire & arousal in couples",
      firstAuthor: "Smith J",
      authorCount: 3,
      journal: "Journal of sex research",
      year: "2024",
      doi: "10.1/x",
      license: "cc by",
    });
    expect(toPaperMeta(row({ license: "CC0" }))?.license).toBe("cc0");
  });

  it("refuses every other license, a missing or odd PMCID, and a retraction", () => {
    for (const license of ["cc by-nc", "cc by-sa", "cc by-nd", "cc by-nc-nd", "", undefined]) {
      expect(toPaperMeta(row({ license })), String(license)).toBeNull();
    }
    expect(toPaperMeta(row({ pmcid: undefined }))).toBeNull();
    expect(toPaperMeta(row({ pmcid: "12345" }))).toBeNull();
    expect(toPaperMeta(row({ pubTypeList: { pubType: ["Retracted Publication"] } }))).toBeNull();
    expect(toPaperMeta(row({ pubTypeList: { pubType: "Retraction of Publication" } }))).toBeNull();
  });
});

describe("articleLicense reads the article's own statement", () => {
  it("accepts any version of CC BY, in an attribute or in the text, and CC0", () => {
    expect(articleLicense(ccBy("4.0"))?.license).toBe("cc by");
    expect(articleLicense(ccBy("3.0"))?.url).toBe("https://creativecommons.org/licenses/by/3.0/");
    // BMC's style: the address sits in the license text, not in an attribute.
    expect(
      articleLicense(
        permissions(
          "<license><license-p>distributed under the terms of the Creative Commons Attribution License ( http://creativecommons.org/licenses/by/2.0 ), which permits unrestricted use</license-p></license>"
        )
      )?.license
    ).toBe("cc by");
    expect(
      articleLicense(
        permissions(
          "<license><ali:license_ref>https://creativecommons.org/publicdomain/zero/1.0/</ali:license_ref></license>"
        )
      )?.license
    ).toBe("cc0");
  });

  it("refuses NC, ND and SA, even beside a CC BY link, and anything it cannot read", () => {
    for (const kind of ["by-nc", "by-nd", "by-sa", "by-nc-nd", "by-nc-sa"]) {
      expect(
        articleLicense(
          permissions(
            `<license xlink:href="https://creativecommons.org/licenses/${kind}/4.0/"></license>`
          )
        ),
        kind
      ).toBeNull();
    }
    expect(
      articleLicense(
        permissions(
          '<license xlink:href="https://creativecommons.org/licenses/by/4.0/"><license-p>Free for non-commercial use only.</license-p></license>'
        )
      )
    ).toBeNull();
    // A publisher's own open-access terms are not a Creative Commons license.
    expect(
      articleLicense(
        permissions(
          "<license><license-p>Open access under the publisher's terms.</license-p></license>"
        )
      )
    ).toBeNull();
    expect(articleLicense("<article><front></front></article>")).toBeNull();
  });
});

describe("the text is the paper's prose and nothing else", () => {
  it("keeps named citations, drops numeric markers and the brackets they leave", () => {
    const t = jatsToText(
      '<p>Desire is common (<xref ref-type="bibr" rid="B1">Smith et al., 2005</xref>; <xref rid="B2">Kedde, 2012</xref>) and varies [<xref rid="B3">3</xref>, <xref rid="B4">4</xref>]. See also (<xref rid="B5">5</xref>).</p>'
    );
    expect(t).toBe("Desire is common (Smith et al., 2005; Kedde, 2012) and varies. See also.");
  });

  it("leaves out tables, figures, formulas and the reference list, and keeps section titles", () => {
    const t = jatsToText(
      "<sec><title>Methods</title><p>We asked 200 people.</p>" +
        "<table-wrap><table><tr><td>99.9</td></tr></table></table-wrap>" +
        "<fig><caption>Figure 1: 42%</caption></fig>" +
        "<disp-formula>x = 7</disp-formula>" +
        "<ref-list><ref>Some Author 1999</ref></ref-list></sec>"
    );
    expect(t).toBe("Methods\nWe asked 200 people.");
  });

  it("decodes entities and removes invisible characters", () => {
    expect(jatsToText("<p>Lust &amp; love&#x200B; &lt;3 &#8211; both.</p>")).toBe(
      "Lust & love <3 – both."
    );
  });

  it("takes the abstract and the body, never the back matter, and nothing without a body", () => {
    const xml =
      "<article><front><abstract><p>We found X.</p></abstract></front>" +
      "<body><sec><title>Intro</title><p>Body text.</p></sec></body>" +
      "<back><ack><p>Thanks to funders.</p></ack><ref-list><ref>R1</ref></ref-list></back></article>";
    const t = articleText(xml);
    expect(t).toBe("Abstract\nWe found X.\n\nIntro\nBody text.");
    expect(
      articleText("<article><front><abstract><p>Only this.</p></abstract></front></article>")
    ).toBe("");
  });
});

describe("paperRows: every part says whose work it is, and fits", () => {
  const text = Array.from(
    { length: 120 },
    (_, i) => `Paragraph ${i + 1}. ${"Words about desire. ".repeat(12)}`
  ).join("\n\n");
  const rows = paperRows(
    meta(),
    text,
    "https://creativecommons.org/licenses/by/4.0/",
    "Sexual Desire",
    "2026-09-30T00:00:00Z"
  );

  it("splits into parts that fit the write cap with their head, numbered in ids and titles", () => {
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((r) => r.body.length <= MAX_BODY_CHARS)).toBe(true);
    expect(rows[0]!.source_id).toBe("paper:PMC8255964");
    expect(rows[1]!.source_id).toBe("paper:PMC8255964#2");
    expect(rows[0]!.title).toBe(`Paper: ${meta().title}, van Lankveld JJDM et al. 2021`);
    expect(rows[1]!.title).toMatch(new RegExp(`\\(part 2 of ${rows.length}\\)$`));
  });

  it("opens every part with the paper, its authors, its license and whose claim it is not", () => {
    rows.forEach((r, i) => {
      expect(r.body.startsWith(partHead(meta(), i + 1, rows.length) + "\n")).toBe(true);
      expect(r.body).toContain(
        "Open-access research under CC BY: third-party work, not LoveIQ's own claim."
      );
    });
  });

  it("keeps the whole text, and files authors under a key that is not a colleague's", () => {
    const joined = rows.map((r) => r.body.slice(r.body.indexOf("\n") + 1)).join("\n\n");
    expect(joined.replace(/\s+/g, " ").trim()).toBe(text.replace(/\s+/g, " ").trim());
    for (const r of rows) {
      expect(r.meta).not.toHaveProperty("author");
      expect(r.meta).toMatchObject({
        kind: "paper",
        first_author: "van Lankveld JJDM",
        license: "cc by",
        construct: "Sexual Desire",
      });
      expect(r.period_end).toBeNull();
      expect(r.url).toBe("https://europepmc.org/article/PMC/PMC8255964");
    }
  });
});

describe("ingestPapers", () => {
  const good = (pmcid: string) =>
    `<article><front>${ccBy().replace("<article><front>", "").replace("</front>", "")}</front><body><p>${"Real findings. ".repeat(400)}</p></body></article>`;
  const run = async (opts: {
    found?: Record<string, PaperMeta[] | null>;
    articles?: Record<string, string | null>;
    stored?: string[];
    outOfTime?: () => boolean;
  }) => {
    const written: BrainRow[][] = [];
    const constructs = Object.keys(opts.found ?? { A: [] });
    const result = await ingestPapers(constructs, 0, "2026-09-30T00:00:00Z", opts.outOfTime, {
      stored: async () => new Set(opts.stored ?? []),
      search: async (c) => (opts.found ?? {})[c] ?? [],
      // `in`, not `??`: a null here means "unreadable", and must not become a good article.
      article: async (id) => (opts.articles && id in opts.articles ? opts.articles[id]! : good(id)),
      upsert: async (rows) => {
        written.push(rows);
        return rows.length;
      },
      pause: async () => {},
    });
    return { result, written };
  };
  // constructsForDay(…, 0) keeps indices 0, 30, 60…; one construct is enough here.

  it("writes each new paper in its own call and skips what is already stored", async () => {
    const { result, written } = await run({
      found: { A: [meta({ pmcid: "PMC1" }), meta({ pmcid: "PMC2" })] },
      stored: ["PMC2"],
    });
    expect(result.written).toBe(1);
    expect(result.skipped.stored).toBe(1);
    expect(written).toHaveLength(1);
    expect(written[0]!.every((r) => r.source_id.startsWith("paper:PMC1"))).toBe(true);
  });

  it("skips a paper whose article refuses the license, has no text, or is too short", async () => {
    const { result } = await run({
      found: {
        A: [
          meta({ pmcid: "PMC1" }),
          meta({ pmcid: "PMC2" }),
          meta({ pmcid: "PMC3" }),
          meta({ pmcid: "PMC4" }),
        ],
      },
      articles: {
        PMC1: `<article><front><permissions><license xlink:href="https://creativecommons.org/licenses/by-nc/4.0/"></license></permissions></front><body><p>${"x ".repeat(3000)}</p></body></article>`,
        PMC2: null,
        PMC3: `<article><front>${ccBy().slice(15, -8)}</front></article>`,
        PMC4: `<article><front>${ccBy().slice(15, -8)}</front><body><p>Too short.</p></body></article>`,
      },
    });
    expect(result.written).toBe(0);
    expect(result.skipped).toMatchObject({ license: 1, unread: 1, noText: 2 });
    expect(MIN_TEXT_CHARS).toBeGreaterThan("Too short.".length);
  });

  it("stops at the run's cap and at its clock", async () => {
    const many = Array.from({ length: MAX_PAPERS_PER_RUN + 5 }, (_, i) =>
      meta({ pmcid: `PMC${i + 1}` })
    );
    const capped = await run({ found: { A: many } });
    expect(capped.result.written).toBe(MAX_PAPERS_PER_RUN);
    let calls = 0;
    const timed = await run({ found: { A: many }, outOfTime: () => ++calls > 3 });
    expect(timed.result.written).toBeLessThan(MAX_PAPERS_PER_RUN);
  });

  it("counts a failed search, and writes a paper found twice only once", async () => {
    const result = await ingestPapers(
      Array.from({ length: 61 }, (_, i) => `C${String(i).padStart(2, "0")}`),
      0,
      "2026-09-30T00:00:00Z",
      () => false,
      {
        stored: async () => new Set(),
        // Day 0 visits C00, C30 and C60.
        search: async (c) => (c === "C30" ? null : [meta({ pmcid: "PMC9" })]),
        article: async (id) => good(id),
        upsert: async (rows) => rows.length,
        pause: async () => {},
      }
    );
    expect(result).toMatchObject({ constructs: 3, searches: 3, failedSearches: 1, written: 1 });
    expect(result.skipped.stored).toBe(1);
  });
});

describe("talking to Europe PMC", () => {
  beforeEach(() => {
    fetched = [];
    storedPages = [];
  });

  it("evidence: a 200 without a count or results is a failed search, not thin literature", async () => {
    answer = () => new Response(JSON.stringify({ resultList: { result: [] } }), { status: 200 });
    expect(await searchEvidence("Sexual Desire")).toBeNull();
    answer = () => new Response(JSON.stringify({ hitCount: 4 }), { status: 200 });
    expect(await searchEvidence("Sexual Desire")).toBeNull();
    answer = () =>
      new Response(JSON.stringify({ hitCount: 0, resultList: { result: [] } }), { status: 200 });
    expect(await searchEvidence("Sexual Desire")).toEqual({ hitCount: 0, papers: [] });
  });

  it("papers: a refused, broken or list-less search is null; a good one keeps only CC BY and CC0", async () => {
    answer = () => new Response("", { status: 503 });
    expect(await searchPapers("Sexual Desire")).toBeNull();
    answer = () => new Response("not json", { status: 200 });
    expect(await searchPapers("Sexual Desire")).toBeNull();
    answer = () =>
      new Response(
        JSON.stringify({
          resultList: {
            result: [
              { pmcid: "PMC1", title: "A", license: "cc by" },
              { pmcid: "PMC2", title: "B", license: "cc by-nc" },
            ],
          },
        }),
        { status: 200 }
      );
    expect((await searchPapers("Sexual Desire"))?.map((p) => p.pmcid)).toEqual(["PMC1"]);
    expect(decodeURIComponent(fetched.at(-1)!)).toContain('LICENSE:"cc by"');
  });

  it("fetchArticle returns the XML, or null for a refusal or a page that is not an article", async () => {
    answer = () => new Response("<article>ok</article>", { status: 200 });
    expect(await fetchArticle("PMC1")).toBe("<article>ok</article>");
    expect(fetched.at(-1)).toContain("/PMC1/fullTextXML");
    answer = () => new Response("<html>not found</html>", { status: 200 });
    expect(await fetchArticle("PMC1")).toBeNull();
    answer = () => new Response("", { status: 404 });
    expect(await fetchArticle("PMC1")).toBeNull();
  });

  it("storedPmcids pages through the stored ids, counts each paper once, and throws on a bad read", async () => {
    storedPages = [
      new Response(
        JSON.stringify(
          Array.from({ length: 1000 }, (_, i) => ({
            source_id: `paper:PMC${i % 400}${i >= 400 ? `#${i}` : ""}`,
          }))
        ),
        { status: 200 }
      ),
      new Response(JSON.stringify([{ source_id: "paper:PMC999" }]), { status: 200 }),
    ];
    const ids = await storedPmcids();
    expect(ids.has("PMC0")).toBe(true);
    expect(ids.has("PMC999")).toBe(true);
    expect([...ids].every((id) => /^PMC\d+$/.test(id))).toBe(true);
    storedPages = [new Response("", { status: 500 })];
    await expect(storedPmcids()).rejects.toThrow(/could not read/);
  });
});
