/**
 * Survey 2.0's short guide in AP-Analytics (Mark's Pre Survey Wizard, behind the `survey_2`
 * switch): its steps per day from ap_guide_facts (20261123140000), shaped as ap_facts' intro rows,
 * so the Survey page shows its three cards and its consent as it shows the intro's.
 */
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

import type { IntroFact } from "./facts";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** The function's rows as the intro's: the guide has no "skipped to question 1" and no direct. */
export function parseGuideFacts(json: unknown): IntroFact[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((r): IntroFact[] => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    return [
      {
        day: String(o.day),
        step: String(o.step),
        n: num(o.n),
        ms: Array.isArray(o.ms) ? o.ms.map(num) : [],
        skipped: 0,
        wentOn: num(o.wentOn),
        left: num(o.left),
        direct: 0,
      },
    ];
  });
}

/**
 * The guide's rows for a range, or null when they can't be read (the function not applied yet, a
 * timeout): the page then leaves the guide's table out and the intro's rows as ap_facts gives them.
 */
export async function fetchGuideFacts(from: string, to: string): Promise<IntroFact[] | null> {
  try {
    const res = await supabaseFetch("/rest/v1/rpc/ap_guide_facts", {
      method: "POST",
      body: JSON.stringify({ p_from: from, p_to: to }),
      timeoutMs: 20_000,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "AP survey: the short guide's steps could not be read");
      return null;
    }
    return parseGuideFacts(await res.json());
  } catch (err) {
    logger.warn({ err }, "AP survey: the short guide's steps could not be read");
    return null;
  }
}

/** The steps the guide shares with the intro: ap_facts counts them for every visitor. */
const SHARED = new Set(["consent_view", "consent_back", "survey_engine_mount"]);

/**
 * The intro's rows without the guide's visitors. ap_facts counts every visitor's consent and
 * question 1, a guide visitor's too (as "direct": they saw no intro that day), so the guide's own
 * rows for those steps come off, day by day: what stays is the intro's visitors and the landing
 * card's. Exact, as both read the same funnel_event rows by the same rules.
 */
export function withoutGuide(intro: IntroFact[], guide: IntroFact[] | null): IntroFact[] {
  if (!guide?.length) return intro;
  const theirs = new Map(
    guide.filter((g) => SHARED.has(g.step)).map((g) => [`${g.day}|${g.step}`, g] as const)
  );
  return intro.map((r) => {
    const g = theirs.get(`${r.day}|${r.step}`);
    if (!g) return r;
    return {
      ...r,
      n: Math.max(0, r.n - g.n),
      ms: withoutValues(r.ms, g.ms),
      wentOn: r.wentOn === null ? null : Math.max(0, r.wentOn - (g.wentOn ?? 0)),
      left: r.left === null ? null : Math.max(0, r.left - (g.left ?? 0)),
      direct: r.step === "consent_view" ? Math.max(0, r.direct - g.n) : r.direct,
    };
  });
}

/** `all` without one of each value in `some` (the guide's times among every visitor's). */
function withoutValues(all: number[], some: number[]): number[] {
  const owed = new Map<number, number>();
  for (const v of some) owed.set(v, (owed.get(v) ?? 0) + 1);
  return all.filter((v) => {
    const k = owed.get(v) ?? 0;
    if (k === 0) return true;
    owed.set(v, k - 1);
    return false;
  });
}
