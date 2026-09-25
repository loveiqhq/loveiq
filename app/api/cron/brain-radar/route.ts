import { NextResponse } from "next/server";
import { cliBinary, complete } from "@features/brain/server/llm";
import { recordNotice } from "@features/brain/server/notice";
import { runRadar } from "@features/brain/server/radar";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { recordCronRun, verifyCronAuth } from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Only ever called in GitHub Actions (scripts/brain-cron.ts); the real ceiling is BUDGET_MS.
export const maxDuration = 300;

/** A first run checks every topic, about a minute each; later runs only what changed. */
const BUDGET_MS = 15 * 60_000;

/**
 * GET /api/cron/brain-radar
 *
 * The decision radar (features/brain/server/radar.ts), nightly in GitHub Actions right
 * after the decision miner (`brain-daily.yml`, job brain-mine), because the model is the
 * Team subscription's `claude` binary. Checks each topic whose decisions changed for
 * pairs that may not both stand, records them, marks them on the decision records, and
 * writes one notice when it found new ones.
 *
 * `cron_run` says "error" when the decisions could not be read, or when every topic it
 * tried failed; a topic that failed is simply tried again tomorrow.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }
  // Claude only, through the Team subscription's binary (BRAIN_LLM_CLI), like the Night
  // Shift: Jarvis's model is Claude, so the older API-key lane is refused, not used.
  if (!cliBinary()) {
    return NextResponse.json(
      {
        ok: false,
        error: "BRAIN_LLM_CLI is not set: the decision radar runs in GitHub Actions only.",
      },
      { status: 503 }
    );
  }
  const startedAtMs = Date.now();
  let status: "success" | "error" = "success";
  let detail: string | undefined;
  try {
    const r = await runRadar({ complete, now: Date.now }, BUDGET_MS);
    if (r.found.length) {
      await recordNotice({
        headline: `${r.found.length} recorded decision${r.found.length === 1 ? " pair" : " pairs"} may not both stand`,
        detail:
          r.found
            .slice(0, 12)
            .map(
              (f) =>
                `- ${f.topic}: "${f.earlierTitle}" (decision/${f.earlier.replace(/^decision:/, "")}) and ` +
                `"${f.laterTitle}" (decision/${f.later.replace(/^decision:/, "")}). ${f.why}`
            )
            .join("\n") +
          (r.found.length > 12 ? `\n(${r.found.length - 12} more.)` : "") +
          "\n\nEach is a question for whoever made the call: decision_conflicts lists them, and " +
          "settle_decision_conflict records which one stands.",
        kind: "brain-radar",
      });
    }
    if (!r.ok) status = "error";
    detail =
      `decisions=${r.decisions} topics=${r.topics} checked=${r.checked.length} unchanged=${r.unchanged} ` +
      `candidates=${r.candidates} found=${r.found.length} auto_settled=${r.autoSettled} marked=${r.marked}` +
      (r.failed.length
        ? ` failed=${r.failed.map((f) => `${f.topic}:${f.reason}`).join(",")}`
        : "") +
      (r.outOfTime.length ? ` left_for_tomorrow=${r.outOfTime.length}` : "") +
      (r.error ? ` error=${r.error}` : "");
    logger.info({ ...r, found: r.found.length }, "brain-radar: done");
    return NextResponse.json({ ok: r.ok, found: r.found.length }, { status: r.ok ? 200 : 502 });
  } catch (err) {
    status = "error";
    detail = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain-radar failed");
    return NextResponse.json({ ok: false, error: "Internal" }, { status: 500 });
  } finally {
    await recordCronRun("brain-radar", startedAtMs, status, detail);
  }
}
