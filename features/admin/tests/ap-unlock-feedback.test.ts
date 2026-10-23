import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildUnlockFeedbackPage,
  maskNote,
  parseUnlockFeedback,
  wilson,
  WRITTEN_MAX,
  type UnlockFeedbackPayload,
} from "@features/admin/server/ap/unlock-feedback";
import type { Masker } from "@features/admin/server/team-export";

type Raw = Record<string, unknown>;

const AFTER = { reached: {}, read_ms: 0, closed: 0, ups: 0, downs: 0, shared: false };

/** An email as ap_unlock_feedback returns it: sent and delivered on 20 Oct, nothing more. */
const email = (over: Raw = {}): Raw => ({
  day: "2026-10-20",
  arm: "A",
  sent_at: "2026-10-20T08:00:00Z",
  src: "google",
  med: "cpc",
  delivered_at: "2026-10-20T08:00:05Z",
  opened_at: null,
  clicked_at: null,
  bounced_at: null,
  reason: null,
  answered_at: null,
  changed_at: null,
  loads: 0,
  chips: [],
  note: null,
  detail_at: null,
  device: null,
  already_paid: false,
  unlocked_at: null,
  gender: null,
  age: null,
  archetype: null,
  unsub_at: null,
  after: null,
  ...over,
});

/** A person's answer half an hour after delivery, unlocking the report. */
const answer = (reason: string, over: Raw = {}): Raw =>
  email({
    opened_at: "2026-10-20T08:30:00Z",
    clicked_at: "2026-10-20T08:31:00Z",
    reason,
    answered_at: "2026-10-20T08:31:10Z",
    loads: 1,
    device: "mobile",
    unlocked_at: "2026-10-20T08:31:11Z",
    after: AFTER,
    ...over,
  });

const TODAY = "2026-10-26";
const NOW = new Date("2026-10-26T10:00:00Z");

function build(
  data: Raw,
  { from = "2026-10-19", to = "2026-10-25", previous = null as Raw | null } = {}
): UnlockFeedbackPayload {
  return buildUnlockFeedbackPage({
    data: parseUnlockFeedback(data),
    previous: previous ? parseUnlockFeedback(previous) : null,
    filters: parseFilters({ period: "custom", from, to }, TODAY),
    today: TODAY,
    now: NOW,
  });
}

/** A masker that turns one address into a code full of digits, as a real one may. */
const digitsMasker: Masker = {
  email: () => "masked-1234567890ab",
  text: (s) => s.replace(/ana@example\.com/g, "masked-1234567890ab"),
  json: (v) => v,
  unclassified: () => [],
};

describe("parseUnlockFeedback", () => {
  it("refuses a payload without its rows or paying readers, rather than read zeros", () => {
    expect(() => parseUnlockFeedback(null)).toThrow(/unexpected shape/);
    expect(() => parseUnlockFeedback({ rows: [] })).toThrow(/unexpected shape/);
  });

  it("reads the function's names into the page's", () => {
    const d = parseUnlockFeedback({
      rows: [
        answer("too_expensive", { chips: ["A little less"], unsub_at: "2026-10-21T09:00:00Z" }),
      ],
      paid: [{ day: "2026-10-20", src: null, med: null }],
      first_sent: "2026-10-19",
    });
    expect(d.rows[0]).toMatchObject({
      reason: "too_expensive",
      answeredAt: "2026-10-20T08:31:10Z",
      chips: ["A little less"],
      unsubAt: "2026-10-21T09:00:00Z",
      after: { reached: {}, readMs: 0, shared: false },
    });
    // A paying reader without their "after" has done nothing after it yet.
    expect(d.paid[0]!.after).toEqual({
      reached: {},
      readMs: 0,
      closed: 0,
      ups: 0,
      downs: 0,
      shared: false,
    });
    expect(d.firstSent).toBe("2026-10-19");
  });
});

describe("an empty range", () => {
  const page = build({ rows: [], paid: [], first_sent: null });

  it("says the email has not gone out, and shows every part empty, never a made-up zero rate", () => {
    expect(page.running).toBeNull();
    expect(page.notes).toContain(
      "The email has not been sent yet: every figure here starts with the first send."
    );
    expect(page.tiles.map((t) => [t.key, t.value, t.prev])).toEqual([
      ["delivered", 0, null],
      ["answers", 0, null],
      ["detail", 0, null],
      ["unlocks", 0, null],
      ["report", 0, null],
      ["unsubscribed", 0, null],
    ]);
    expect(page.funnel.every((s) => s.n === 0 && s.bar === 0 && s.ofPrev === null)).toBe(true);
    expect(page.reasons).toHaveLength(8);
    expect(page.reasons.every((r) => r.n === 0 && r.share === null)).toBe(true);
    expect(page.reasons.at(-1)!.code).toBe("other");
    expect(page.arms.map((a) => [a.arm, a.rate, a.lo])).toEqual([
      ["A", null, null],
      ["B", null, null],
      ["C", null, null],
      ["D", null, null],
    ]);
    expect(page.time.medianMs).toBeNull();
    expect(page.after.rows.every((r) => r.free === null && r.paid === null)).toBe(true);
    expect(page.written).toEqual({ total: 0, rows: [] });
  });
});

describe("from send to answer", () => {
  const rows = [
    email({ delivered_at: null }), // sent, nothing heard since
    email(), // delivered
    email({ opened_at: "2026-10-20T09:00:00Z" }), // opened
    // A click with no open recorded (images off), and no answer: a scanner's GET.
    email({ clicked_at: "2026-10-20T08:00:06Z" }),
    // Answered with no click recorded; two more taps or reloads; two chips; read past chapter one.
    answer("too_expensive", {
      clicked_at: null,
      opened_at: null,
      loads: 3,
      chips: ["About half the price", "Pay per chapter"],
      detail_at: "2026-10-20T08:32:00Z",
      after: {
        ...AFTER,
        reached: {
          introduction: "2026-10-20T08:40:00Z",
          core_archetype: "2026-10-20T08:45:00Z",
        },
      },
    }),
    // Answered a second after delivery: a bot that ran the page, though the page unlocked it.
    answer("result_off", { answered_at: "2026-10-20T08:00:06Z" }),
    // Had bought before answering: an answer, nothing to unlock.
    answer("privacy", {
      already_paid: true,
      unlocked_at: null,
      note: "Bought it already. Call me on +49 151 2345678 or write to ana@example.com",
      detail_at: "2026-10-20T08:33:00Z",
    }),
    // Changed the answer alone: detail_at is stamped, but no chip and no words.
    answer("too_expensive", {
      loads: 2,
      changed_at: "2026-10-20T08:35:00Z",
      detail_at: "2026-10-20T08:35:00Z",
      after: { ...AFTER, reached: { introduction: "2026-10-20T08:40:00Z" } },
    }),
    email({ delivered_at: null, bounced_at: "2026-10-20T08:00:03Z" }), // bounced
  ];
  const page = build({ rows, paid: [], first_sent: "2026-10-19" });

  it("counts each step so that none outnumbers the one before", () => {
    expect(page.funnel.map((s) => [s.key, s.n])).toEqual([
      ["sent", 9],
      ["delivered", 7],
      ["opened", 6],
      ["clicked", 5],
      ["answered", 3],
      ["detail", 2],
      ["report", 1],
    ]);
    const share = (k: string) => page.funnel.find((s) => s.key === k)!;
    expect(share("delivered").ofPrev).toBeCloseTo(7 / 9);
    expect(share("answered").ofPrev).toBeCloseTo(3 / 5);
    // Opened report is of the free unlocks (2), not of the answers.
    expect(share("report").ofPrev).toBeCloseTo(1 / 2);
    expect(share("report").ofDelivered).toBeCloseTo(1 / 7);
    expect(share("sent")).toMatchObject({ ofPrev: null, ofDelivered: null, bar: 1 });
    expect(page.bounced).toBe(1);
  });

  it("writes the tiles' lines as the design does, rounded to a tenth", () => {
    expect(page.tiles.map((t) => [t.key, t.value, t.foot])).toEqual([
      ["delivered", 7, "77.8% of 9 sent"],
      ["answers", 3, "42.9% of delivered"],
      ["detail", 2, "66.7% of answers"],
      ["unlocks", 2, "one per answer · 1 had bought already"],
      ["report", 1, "50.0% of unlocks"],
      ["unsubscribed", 0, "0.0% of delivered"],
    ]);
    expect(page.tiles.find((t) => t.key === "unsubscribed")!.goodWhen).toBe("down");
  });

  it("takes the scanners and bots off the raw clicks to leave the answers we count", () => {
    const q = Object.fromEntries(page.quality.map((l) => [l.key, l.n]));
    expect(q).toEqual({ raw: 5, bots: 2, answers: 3, repeats: 3, changed: 1 });
    expect(q.raw! - q.bots!).toBe(q.answers);
    expect(page.quality.find((l) => l.key === "repeats")!.name).toBe("Repeat taps and reloads");
  });

  it("shares the reasons out of the answers we count, largest first and Something else last", () => {
    expect(page.answers).toBe(3);
    expect(page.reasons.slice(0, 2).map((r) => [r.code, r.n, r.share])).toEqual([
      ["too_expensive", 2, 2 / 3],
      ["privacy", 1, 1 / 3],
    ]);
    expect(page.reasons.map((r) => r.code).slice(2)).toEqual([
      "low_value",
      "free_enough",
      "unclear_content",
      "result_off",
      "time_commitment",
      "other",
    ]);
    expect(page.reasons[0]).toMatchObject({
      bar: 1,
      detail: 1,
      label: "More than I wanted to pay",
    });
    expect(page.reasons[1]!.bar).toBe(0.5);
    expect(page.themes.map((t) => [t.name, t.n])).toEqual([
      ["Price", 2],
      ["Trust", 1],
      ["Offer", 0],
      ["Friction", 0],
      ["Other", 0],
    ]);
  });

  it("counts the follow-up chips, most picked first, and keeps the admin's wording", () => {
    expect(page.reasons[0]!.chips).toEqual([
      { label: "About half the price", n: 1 },
      { label: "Pay per chapter", n: 1 },
      { label: "A little less", n: 0 },
      { label: "A gift or bundle for two", n: 0 },
      { label: "Price wasn’t really it", n: 0 },
    ]);
    expect(page.reasons[1]!.question).toBe("What gave them pause?");
    expect(page.reasons.find((r) => r.code === "other")!.question).toBe("Free text only");
  });

  it("masks the words before they leave: no address, no phone number", () => {
    const [quote] = page.reasons[1]!.quotes;
    expect(quote).toMatch(
      /^Bought it already\. Call me on \[masked\] or write to masked-[0-9a-f]{12}$/
    );
    expect(JSON.stringify(page)).not.toMatch(/ana@example|2345678/);
    expect(page.written.rows).toEqual([
      {
        at: "2026-10-20T08:33:00Z",
        reason: "Paying felt too personal",
        text: quote,
        archetype: null,
        device: "Mobile",
      },
    ]);
  });
});

describe("maskNote", () => {
  it("masks email addresses, report links and phone numbers as people write them", () => {
    expect(maskNote("Mail ana.lopez@example.com, or call +49 151 2345678.")).toMatch(
      /^Mail masked-[0-9a-f]{12}, or call \[masked\]\.$/
    );
    expect(maskNote("0151-234 56 78 or (030) 1234567")).toBe("[masked] or [masked]");
    expect(maskNote("my link loveiq.org/report/rpt_abc123")).toBe(
      "my link loveiq.org/report/[masked]"
    );
  });

  it("keeps prices, shares and short numbers", () => {
    const text = "At 29.99 I would, 50% off is fair, 3 chapters in 12 min";
    expect(maskNote(text)).toBe(text);
  });

  it("never cuts into the code an address is masked to", () => {
    expect(maskNote("write to ana@example.com", digitsMasker)).toBe("write to masked-1234567890ab");
  });
});

describe("wilson", () => {
  it("gives the 90% Wilson interval, inside 0 to 1", () => {
    expect(wilson(0, 10)!.lo).toBe(0);
    expect(wilson(0, 10)!.hi).toBeCloseTo(0.212942, 5);
    expect(wilson(5, 10)!.lo).toBeCloseTo(0.269272, 5);
    expect(wilson(5, 10)!.hi).toBeCloseTo(0.730728, 5);
    expect(wilson(75, 299)!.lo).toBeCloseTo(0.211959, 5);
    expect(wilson(75, 299)!.hi).toBeCloseTo(0.294182, 5);
    expect(wilson(3, 0)).toBeNull();
  });

  it("is the subject test's interval, of the emails delivered per arm", () => {
    const rows = [
      answer("time_commitment", { arm: "B" }),
      answer("time_commitment", { arm: "B" }),
      answer("time_commitment", { arm: "B" }),
      email({ arm: "B" }),
      email({ arm: "C" }),
    ];
    const page = build({ rows, paid: [], first_sent: "2026-10-19" });
    const b = page.arms.find((a) => a.arm === "B")!;
    expect(b).toMatchObject({ delivered: 4, answers: 3, rate: 0.75 });
    expect(b.lo).toBeCloseTo(0.356168, 5);
    expect(b.hi).toBeCloseTo(0.942093, 5);
    expect(b.subject).toBe("One tap, and your full LoveIQ report is yours, free");
    expect(page.arms.find((a) => a.arm === "D")!.subject).toBe(
      "[Archetype], your full report is free for one answer"
    );
    expect(page.arms.find((a) => a.arm === "C")).toMatchObject({ delivered: 1, rate: 0 });
  });
});

describe("segments", () => {
  // 21 women 25–34 on their phones, 3 men 45–54 on a computer.
  const rows = [
    ...Array.from({ length: 21 }, (_, i) =>
      answer(i < 14 ? "too_expensive" : "free_enough", { gender: "Woman", age: "25–34" })
    ),
    ...Array.from({ length: 3 }, () =>
      answer("time_commitment", { device: "desktop", gender: "Man", age: "45–54" })
    ),
  ];
  const page = build({ rows, paid: [], first_sent: "2026-10-19" });
  const col = (name: string) => page.segments.columns.findIndex((c) => c.name === name);

  it("greys out a group under 20 answers", () => {
    expect(page.segments.columns.map((c) => [c.name, c.n, c.small])).toEqual([
      ["Mobile", 21, false],
      ["Desktop", 3, true],
      ["Tablet", 0, true],
      ["Women", 21, false],
      ["Men", 3, true],
      ["Age 18–24", 0, true],
      ["Age 25–34", 21, false],
      ["Age 35–44", 0, true],
      ["Age 45–54", 3, true],
      ["Age 55+", 0, true],
    ]);
  });

  it("adds each column up to 100% over the reasons", () => {
    for (const name of ["Mobile", "Women", "Age 25–34", "Desktop"]) {
      const i = col(name);
      const total = page.segments.rows.reduce((a, r) => a + (r.cells[i] ?? 0), 0);
      expect(total).toBeCloseTo(1);
    }
    const tooExpensive = page.segments.rows.find((r) => r.code === "too_expensive")!;
    expect(tooExpensive.cells[col("Mobile")]).toBeCloseTo(14 / 21);
    expect(tooExpensive.cells[col("Tablet")]).toBeNull();
  });
});

describe("answers per day after the send", () => {
  it("counts days of 24 hours from the send, the last bar holding day 10 and later", () => {
    const at = (h: number) => new Date(Date.parse("2026-10-20T08:00:00Z") + h * 3_600_000);
    const rows = [1, 30, 50, 300].map((h) =>
      answer("time_commitment", { answered_at: at(h).toISOString() })
    );
    const page = build({ rows, paid: [], first_sent: "2026-10-19" });
    expect(page.time.days.map((d) => d.n)).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(page.time.days.at(-1)!.label).toBe("D10+");
    expect(page.time.medianMs).toBe(40 * 3_600_000);
    expect(page.time.within48h).toBe(0.5);
  });
});

describe("after the free unlock, against paying readers", () => {
  const read = (over: Raw) => ({ ...AFTER, ...over });
  const rows = [
    answer("time_commitment", {
      after: read({
        reached: { introduction: "2026-10-20T09:00:00Z", love_language: "2026-10-20T09:05:00Z" },
        read_ms: 240_000,
        closed: 1,
        ups: 3,
        downs: 1,
      }),
    }),
    answer("time_commitment", {
      after: read({ reached: { introduction: "2026-10-20T09:00:00Z" } }),
    }),
  ];
  const paid = [
    {
      day: "2026-10-21",
      src: "google",
      med: "cpc",
      after: read({
        reached: { introduction: "x", core_archetype: "2026-10-21T10:00:00Z", energy_level: "y" },
        read_ms: 600_000,
        closed: 2,
        ups: 1,
        shared: true,
      }),
    },
    // Before the first email: no free unlock to set it against.
    { day: "2026-10-18", src: null, med: null, after: read({ shared: true }) },
    // One of our own probes.
    { day: "2026-10-21", src: "prod-verification", med: null, after: read({ shared: true }) },
  ];
  const page = build({ rows, paid, first_sent: "2026-10-19" });

  it("reads each group from its own unlock", () => {
    expect([page.after.free, page.after.paid]).toEqual([2, 1]);
    expect(page.after.rows.map((r) => [r.key, r.free, r.paid])).toEqual([
      ["opened", 0.5, 1],
      // Of the readers whose reading was recorded.
      ["time", 240_000, 600_000],
      // Of the readers who opened any chapter.
      ["chapters", 1.5, 3],
      ["thumbs", 0.75, 1],
      ["shared", 0, 1],
    ]);
  });
});

describe("the period before", () => {
  it("is read at the same age, so a later answer is not yet counted in it", () => {
    // This week 19–25 Oct, read on the 26th at 10:00; the week before is read up to the 19th
    // at 10:00. Its one email was answered on the 19th at 11:00: not yet, at that age.
    const previous = {
      rows: [
        answer("time_commitment", {
          day: "2026-10-13",
          sent_at: "2026-10-13T08:00:00Z",
          delivered_at: "2026-10-13T08:00:05Z",
          opened_at: "2026-10-19T10:59:00Z",
          clicked_at: "2026-10-19T11:00:00Z",
          answered_at: "2026-10-19T11:00:10Z",
          unlocked_at: "2026-10-19T11:00:11Z",
        }),
      ],
      paid: [],
      first_sent: "2026-10-01",
    };
    const page = build(
      { rows: [answer("time_commitment"), email()], paid: [], first_sent: "2026-10-01" },
      { previous }
    );
    const tile = (k: string) => page.tiles.find((t) => t.key === k)!;
    expect([tile("delivered").value, tile("delivered").prev]).toEqual([2, 1]);
    expect([tile("answers").value, tile("answers").prev]).toEqual([1, 0]);
    expect(tile("unlocks").prev).toBe(0);
    expect(page.compare).not.toBeNull();
  });

  it("is not compared when it starts before the first email", () => {
    const page = build(
      { rows: [answer("time_commitment")], paid: [], first_sent: "2026-10-19" },
      { previous: { rows: [], paid: [], first_sent: "2026-10-19" } }
    );
    expect(page.tiles.every((t) => t.prev === null)).toBe(true);
    expect(page.notes).toContain(
      "Not compared with the period before: the first email went out on 19 Oct 2026."
    );
    expect(page.running).toEqual({ since: "2026-10-19", day: 8 });
  });
});

describe("staff and test", () => {
  it("leaves our own probes out, as every AP page does", () => {
    const page = build({
      rows: [
        answer("time_commitment"),
        answer("time_commitment", { med: "probe" }),
        answer("time_commitment", { src: "prod-e2e-check" }),
      ],
      paid: [],
      first_sent: "2026-10-19",
    });
    expect(page.funnel[0]!.n).toBe(1);
    expect(page.answers).toBe(1);
  });
});

describe("written answers", () => {
  it("lists the newest first, at most WRITTEN_MAX, with the total", () => {
    const rows = Array.from({ length: WRITTEN_MAX + 1 }, (_, i) =>
      answer("other", {
        note: `Note ${i}`,
        detail_at: new Date(Date.parse("2026-10-20T09:00:00Z") + i * 60_000).toISOString(),
      })
    );
    const page = build({ rows, paid: [], first_sent: "2026-10-19" });
    expect(page.written.total).toBe(WRITTEN_MAX + 1);
    expect(page.written.rows).toHaveLength(WRITTEN_MAX);
    expect(page.written.rows[0]!.text).toBe(`Note ${WRITTEN_MAX}`);
    expect(page.reasons.find((r) => r.code === "other")!.quotes).toEqual([
      `Note ${WRITTEN_MAX}`,
      `Note ${WRITTEN_MAX - 1}`,
    ]);
  });
});

describe("ap_unlock_feedback (the migration's text: no database here)", () => {
  const SQL = readFileSync("supabase/migrations/20261018210200_ap_unlock_feedback.sql", "utf8");
  const ROLLBACK = readFileSync(
    "supabase/rollbacks/20261018210200_ap_unlock_feedback_down.sql",
    "utf8"
  );

  it("runs as its owner on a fixed search path, for the service role only", () => {
    expect(SQL).toMatch(
      /CREATE OR REPLACE FUNCTION public\.ap_unlock_feedback\(p_from date, p_to date\)/
    );
    expect(SQL).toMatch(/STABLE SECURITY DEFINER\s+SET search_path TO 'public', 'pg_temp'/);
    expect(SQL).toMatch(
      /REVOKE ALL ON FUNCTION public\.ap_unlock_feedback\(date, date\) FROM PUBLIC, anon, authenticated;/
    );
    expect(SQL).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ap_unlock_feedback\(date, date\) TO service_role;/
    );
    expect(ROLLBACK).toMatch(/DROP FUNCTION IF EXISTS public\.ap_unlock_feedback\(date, date\);/);
  });

  it("counts Berlin days and leaves staff out of the emails and the paying readers", () => {
    expect(SQL).toMatch(/\(p_from::timestamp AT TIME ZONE 'Europe\/Berlin'\) AS since_ts/);
    expect(SQL).toMatch(
      /staff AS \(SELECT u\.id FROM app_user u WHERE u\.email ~\* '@loveiq\\\.org\$'\)/
    );
    expect(
      SQL.match(/NOT EXISTS \(SELECT 1 FROM staff WHERE staff\.id = s\.user_id\)/g)
    ).toHaveLength(3);
  });

  it("reads this email's own events, unsubscribes and gifts", () => {
    expect(SQL).toMatch(/m\.stage = 'unlock_feedback'/);
    expect(SQL).toMatch(/es\.reason = 'unsubscribed' AND es\.source_campaign = 'unlock_feedback'/);
    expect(SQL).toMatch(/p\.metadata->>'source' = 'unlock_feedback'/);
    expect(SQL).toMatch(
      /NOT EXISTS \(SELECT 1 FROM gifts g WHERE g\.sid = fb\.sid AND g\.at < fb\.at\)/
    );
  });

  it("casts the chapters' metadata only once it is checked, and returns no address", () => {
    expect(SQL).toMatch(
      /CASE WHEN c\.value->>'ms' ~ '\^\[0-9\]\{1,8\}\$' THEN \(c\.value->>'ms'\)::int/
    );
    expect(SQL.match(/::int\b/g)).toHaveLength(1);
    // The address is only joined on (us.addr = who.addr): no key of the output names one, and
    // none is selected as a value.
    const output = SQL.slice(SQL.indexOf("SELECT json_build_object(\n    'rows'"));
    expect(output).toMatch(/us\.addr = who\.addr/);
    expect(output).not.toMatch(/'[a-z_]*(email|addr)[a-z_]*'|,\s*(who|us)\.addr\b/);
  });
});
