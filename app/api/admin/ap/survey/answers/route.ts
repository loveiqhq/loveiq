import { NextResponse } from "next/server";

import { fetchAnswers, isDimension, splitAnswers } from "@features/admin/server/ap/answers";
import { assessmentScope } from "@features/admin/server/ap/assessment";
import { fetchFactsFor } from "@features/admin/server/ap/facts";
import { parseFilters } from "@features/admin/server/ap/filters";
import { subsIn } from "@features/admin/server/ap/metrics";
import { markVisitors } from "@features/admin/server/ap/posthog";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const QID = /^\d{5}$/;

/** AP-Analytics, one question's answers in the range, split by a second dimension. */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-answers", limit: 60 });
  if (admin instanceof NextResponse) return admin;

  const params = new URL(request.url).searchParams;
  const qid = params.get("q") ?? "";
  const dim = params.get("dim") ?? "none";
  const other = params.get("other");
  if (
    !QID.test(qid) ||
    !isDimension(dim) ||
    (dim === "question" && (!other || !QID.test(other) || other === qid))
  ) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const filters = parseFilters(params, reportingDay(new Date()));
  try {
    const otherQid = dim === "question" ? other : null;
    const scope = assessmentScope(filters);
    const [{ rows }, facts] = await Promise.all([
      fetchAnswers(filters.from, filters.to, qid, otherQid),
      fetchFactsFor(filters.from, filters.to, filters),
    ]);
    if (filters.visitor !== "all") {
      // An answer's finisher started the survey when their submission says (the same visit).
      const startOf = new Map(facts.subs.map((s) => [s.ph, s.startAt]));
      await markVisitors(rows, (r) => (r.ph ? startOf.get(r.ph) : null));
    }
    // "N of M finished surveys": M are the filters' people (probes out), as N's are.
    const finished = subsIn(facts, scope).length;
    return NextResponse.json(splitAnswers(qid, rows, dim, otherQid, scope, finished), {
      headers: NO_STORE,
    });
  } catch (err) {
    logger.error({ err }, "AP survey answers failed");
    return NextResponse.json({ error: "Unable to load the answers." }, { status: 500 });
  }
}
