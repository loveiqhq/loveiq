/**
 * THE ATTACKER'S VIEW OF A CROSSTAB: given only what `rpc/get_answer_crosstab` returned, can
 * any count under 5 be pinned down? The function's own rules (supabase/migrations/
 * 20261021150000_answer_crosstab.sql) say no number may describe fewer than 5 people, nor
 * give one back by subtraction. This checks the OUTPUT against that promise rather than
 * re-reading the SQL, so a rule that is wrong or missing shows up as a leak.
 *
 * A leak is a number every reading of which is a hidden one: a share that can only stand for
 * fewer than 5 people, a remainder ("(all)" minus the shown groups) that must be under 5, a lone
 * hidden share in a single-choice column. Rounding alone is not one: "1% of 663" could be 4 or 9.
 *
 * Run weekly against production by the MCP battery (scripts/brain-battery.ts, `mcp-crosstab-*`).
 * Verified on 2026-10-21 by breaking each rule in the SQL: every one was caught.
 */

type Cell = {
  q: string;
  n: number | string;
  mean?: number | string;
  pct_5_7?: number | string;
  pct?: Record<string, number | string>;
};
type Row = { group?: string; answer: string; people: number; cols: Cell[] };
export interface Crosstab {
  error?: string;
  row_question: { q: string; type: string };
  people: number;
  columns: Array<{ q: string; type: string }>;
  rows?: Row[];
  people_in_hidden_groups?: number;
}

const isNum = (x: unknown): x is number => typeof x === "number";

/** Every whole count c of n that the function prints as `shown`: whole percents, one decimal where that would read 0 or 100. */
export function countsFor(shown: number, n: number): number[] {
  const out: number[] = [];
  for (let c = 0; c <= n; c++) {
    const f = 200 * c < n || 200 * c >= 199 * n ? 10 : 1;
    if (Math.floor((200 * c * f + n) / (2 * n)) / f === shown) out.push(c);
  }
  return out;
}

const span = (shown: number, n: number): [number, number] => {
  const cs = countsFor(shown, n);
  return [Math.min(...cs), Math.max(...cs)];
};

export function crosstabLeaks(o: Crosstab): string[] {
  const out: string[] = [];
  if (o.error) return out;
  if (!Array.isArray(o.rows)) return ["no rows array"];
  const types = new Map(o.columns.map((c) => [c.q, c.type]));
  const strata = new Map<string, { all?: Row; groups: Row[] }>();
  for (const r of o.rows) {
    const s = r.group ?? "";
    const st = strata.get(s) ?? { groups: [] };
    strata.set(s, st);
    if (r.answer === "(all)") st.all = r;
    else st.groups.push(r);
    const at = `${s}/${r.answer}`;
    if (!(r.people >= 5)) out.push(`${at}: ${r.people} people`);
    for (const c of r.cols) {
      if (c.n === "<5") {
        if (Object.keys(c).length !== 2)
          out.push(`${at}/${c.q}: figures beside fewer than 5 answers`);
        continue;
      }
      // A share or a mean beside an inexact n can pin that n down, and with it who did not answer.
      if (!isNum(c.n) && Object.keys(c).length !== 2)
        out.push(`${at}/${c.q}: figures beside an n of "${c.n}"`);
      const n = isNum(c.n) ? c.n : null;
      if (n !== null && !(n >= 5 && (n === r.people || r.people - n >= 5)))
        out.push(`${at}/${c.q}: ${n} of ${r.people} answered`);
      const share = (label: string, v: unknown) => {
        if (!isNum(v) || n === null) return;
        const cs = countsFor(v, n);
        if (!cs.length) out.push(`${at}/${c.q}/${label}: ${v}% of ${n} is no whole count`);
        else if (cs.every((k) => k < 5 || n - k < 5))
          out.push(`${at}/${c.q}/${label}: ${v}% of ${n} is ${cs.join(" or ")}`);
      };
      if (types.get(c.q) === "scale") {
        if (isNum(c.mean) && (n ?? r.people) < 20)
          out.push(`${at}/${c.q}: a mean of under 20 answers`);
        share("5-7", c.pct_5_7);
      } else {
        for (const [k, v] of Object.entries(c.pct ?? {})) share(k, v);
        if (
          types.get(c.q) === "single" &&
          Object.values(c.pct ?? {}).filter((v) => !isNum(v)).length === 1
        )
          out.push(`${at}/${c.q}: one hidden share, so 100% minus the others`);
      }
    }
  }
  const shown = [...strata.values()].reduce((a, st) => a + (st.all?.people ?? 0), 0);
  const hidden = o.people - shown;
  if (hidden !== (o.people_in_hidden_groups ?? 0))
    out.push(`people minus the shown groups is ${hidden}, not ${o.people_in_hidden_groups ?? 0}`);
  if (hidden > 0 && hidden < 5) out.push(`the hidden group_by values hold ${hidden}`);
  // Where each person is in one row, "(all)" minus the shown rows is what the hidden rows hold.
  if (o.row_question.type === "multiple") return out;
  for (const [s, st] of strata) {
    if (!st.all) continue;
    const rest = st.all.people - st.groups.reduce((a, g) => a + g.people, 0);
    if (rest > 0 && rest < 5) out.push(`${s}: the hidden rows hold ${rest}`);
    for (const c of st.all.cols) {
      if (!isNum(c.n)) continue;
      const all = c.n;
      const gs = st.groups.map((g) => ({ g, c: g.cols.find((x) => x.q === c.q)! }));
      const known = gs.filter((x) => isNum(x.c.n));
      const uPeople = st.all.people - known.reduce((a, x) => a + x.g.people, 0);
      const uN = all - known.reduce((a, x) => a + (x.c.n as number), 0);
      if (!(uPeople === 0 || uN === uPeople || (uN >= 5 && uPeople - uN >= 5)))
        out.push(`${s}/(all)/${c.q}: ${uN} of the ${uPeople} people left answered`);
      const remainder = (label: string, pick: (x: Cell) => unknown) => {
        const v = pick(c);
        if (!isNum(v)) return;
        let [lo, hi] = span(v, all);
        let left = all;
        for (const x of gs) {
          const gv = pick(x.c);
          if (!isNum(gv) || !isNum(x.c.n)) continue;
          const [glo, ghi] = span(gv, x.c.n);
          lo -= ghi;
          hi -= glo;
          left -= x.c.n;
        }
        if (left === 0) return;
        [lo, hi] = [Math.max(lo, 0), Math.min(hi, left)];
        if (hi < 5 || lo > left - 5)
          out.push(`${s}/(all)/${c.q}/${label}: the ${left} left hold ${lo} to ${hi}`);
      };
      if (types.get(c.q) === "scale") {
        remainder("5-7", (x) => x.pct_5_7);
        if (isNum(c.mean)) {
          const left =
            all - gs.reduce((a, x) => a + (isNum(x.c.mean) && isNum(x.c.n) ? x.c.n : 0), 0);
          if (left > 0 && left < 20)
            out.push(`${s}/(all)/${c.q}: the mean minus the shown means leaves ${left} answers`);
        }
      } else {
        for (const k of Object.keys(c.pct ?? {})) remainder(k, (x) => x.pct?.[k]);
      }
    }
  }
  return out;
}
