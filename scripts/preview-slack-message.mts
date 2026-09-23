/**
 * Render a Slack digest to an HTML page and open it — WITHOUT posting anything.
 *
 * WHY THIS EXISTS. Until now the only way to see a digest was to send it. The
 * `?preview=1` flag on conversion-digest *posts to Slack*; it merely skips the
 * once-a-day claim so the send is repeatable. So "let me look at it first" was
 * not a thing you could do, and a chart went out with no axis labels on it
 * because reading the block JSON does not show you a picture.
 *
 * IT CANNOT POST. It never imports notifySlack, and `.env.local` carries no
 * SLACK_BOT_TOKEN or channel webhook — two independent reasons nothing can
 * leave this machine. Keep both true.
 *
 *   npm run dev                                    # serves the chart PNGs
 *   npx tsx --env-file=.env.local scripts/preview-slack-message.mts
 *   npx tsx --env-file=.env.local scripts/preview-slack-message.mts --no-open
 *   npx tsx --env-file=.env.local scripts/preview-slack-message.mts --survey        # latest
 *   npx tsx --env-file=.env.local scripts/preview-slack-message.mts --survey=2078
 *   npx tsx --env-file=.env.local scripts/preview-slack-message.mts --ux-review
 *   npx tsx --env-file=.env.local scripts/preview-slack-message.mts --scorecard
 *
 * The image blocks point at NEXT_PUBLIC_SITE_URL, which is localhost in
 * .env.local, so the REAL chart PNGs render in the page — same renderer, same
 * signed payload, same pixels Slack would receive.
 *
 * Data is REAL PRODUCTION data, read-only, over the same 30-day window the cron
 * uses. Nothing is written anywhere.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  buildConversionDigest,
  MIDWAY_QUESTION_INDEX,
  WINDOW_DAYS,
} from "../app/api/cron/conversion-digest/route";
import { buildSubmissionJourney } from "../features/attribution/server/journey";
import { buildJourneyMessage } from "../features/attribution/server/slack-journey";
import {
  fetchArmCohorts,
  fetchAxisFunnelDaily,
  fetchLandingArmFunnel,
  fetchLandingStartFunnel,
  fetchMidwayProgress,
  fetchPaywallHits,
  fetchEmailExperimentResults,
  fetchUnitEconomics,
} from "../features/admin/server/conversion-digest";
import { dayString, fetchFunnelCvrSparklines } from "../features/admin/server/digest-metrics";
import { adCostByDay } from "../features/brain/server/ingest/analytics";
import { reportingDay, reportingDayStart } from "../shared/time/reporting-day";
import {
  buildDigestMessage as buildUxReviewDigest,
  buildWeeklyScorecard,
  fetchCoverageStats,
  fetchDailyStats as fetchUxDailyStats,
  fetchVerificationStats,
} from "../features/ux-review/server/review";
import {
  buildFrictionReport,
  surveyQuestionNames,
} from "../features/admin/server/friction-metrics";

const OUT_DIR =
  process.env.PREVIEW_OUT_DIR ??
  "/private/tmp/claude-501/-Users-HamzaKorkutovic-loveiq-web/7579ddb7-b61d-44c2-8934-777662d14779/scratchpad";
const OUT = join(OUT_DIR, "slack-preview.html");

/** Slack mrkdwn -> HTML. Only the subset the digests actually use. */
function mrkdwn(raw: string): string {
  const esc = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .replace(/```([\s\S]*?)```/g, (_m, code) => `<pre>${code}</pre>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
    .replace(/_([^_\n]+)_/g, "<i>$1</i>")
    .replace(/\n/g, "<br>");
}

type Block = Record<string, any>;

function renderBlock(b: Block): string {
  switch (b.type) {
    case "header":
      return `<div class="b header">${mrkdwn(String(b.text?.text ?? ""))}</div>`;
    case "section": {
      if (Array.isArray(b.fields)) {
        const cells = b.fields
          .map((f: Block) => `<div class="field">${mrkdwn(String(f.text ?? ""))}</div>`)
          .join("");
        return `<div class="b"><div class="fields">${cells}</div></div>`;
      }
      const accessory = b.accessory
        ? `<div class="accessory">${mrkdwn(String(b.accessory?.text?.text ?? ""))}</div>`
        : "";
      return `<div class="b section">${mrkdwn(String(b.text?.text ?? ""))}${accessory}</div>`;
    }
    case "context":
      return `<div class="b context">${(b.elements ?? [])
        .map((e: Block) => mrkdwn(String(e.text ?? "")))
        .join(" ")}</div>`;
    case "divider":
      return `<hr class="divider">`;
    case "image":
      // src is already a data: URI by this point — see inlineImages(). The page
      // has to be self-contained: local dev sits behind the staging password
      // gate, so a browser opening this file would get a 307 for every chart
      // and show broken images.
      return `<div class="b img"><img src="${String(b.image_url)}" alt="${String(
        b.alt_text ?? ""
      ).replace(/"/g, "&quot;")}"><div class="alt">alt: ${String(b.alt_text ?? "")}</div></div>`;
    case "actions":
      return `<div class="b">${(b.elements ?? [])
        .map((e: Block) => `<span class="btn">${String(e.text?.text ?? "")}</span>`)
        .join(" ")}</div>`;
    default:
      return `<div class="b unknown"><b>${b.type}</b><pre>${JSON.stringify(b, null, 2)}</pre></div>`;
  }
}

/**
 * Replace every image_url with a data: URI, fetching through the staging gate.
 *
 * Local dev is password-gated, and the browser opening this file has no
 * staging_session cookie — every chart would 307 and render as a broken image.
 * Inlining also makes the page portable: it can be sent to someone else and
 * still show the pictures.
 */
async function inlineImages(blocks: Block[]): Promise<{ ok: number; failed: number }> {
  const password = process.env.STAGING_PASSWORD;
  const cookie = password
    ? `staging_session=${createHash("sha256").update(password).digest("hex")}`
    : "";
  let ok = 0;
  let failed = 0;
  for (const b of blocks) {
    if (b.type !== "image" || typeof b.image_url !== "string") continue;
    try {
      const res = await fetch(b.image_url, { headers: cookie ? { cookie } : {} });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const type = res.headers.get("content-type") ?? "image/png";
      b.image_url = `data:${type};base64,${buf.toString("base64")}`;
      ok += 1;
    } catch (err) {
      failed += 1;
      console.log(`  ! chart failed to render: ${(err as Error).message}`);
      // Leave a visible marker rather than a silently broken <img>.
      b.alt_text = `COULD NOT RENDER — ${b.alt_text ?? ""}`;
    }
  }
  return { ok, failed };
}

function page(title: string, fallback: string, blocks: Block[], meta: string): string {
  const imgCount = blocks.filter((b) => b.type === "image").length;
  const json = JSON.stringify(blocks);
  return `<!doctype html>
<meta charset="utf-8">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; background:#f8f8f8; color:#1d1c1d;
         font:15px/1.46 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif; }
  @media (prefers-color-scheme: dark) { body { background:#1a1d21; color:#d1d2d3; } }
  .wrap { max-width: 720px; margin: 0 auto; padding: 24px 16px 64px; }
  .meta { font-size:12px; opacity:.7; margin-bottom:14px; }
  .msg { background:#fff; border:1px solid #ddd; border-radius:8px; padding:16px 18px; }
  @media (prefers-color-scheme: dark) { .msg { background:#222529; border-color:#3a3d42; } }
  .b { margin: 0 0 12px; }
  .b:last-child { margin-bottom: 0; }
  .header { font-size:20px; font-weight:700; letter-spacing:-.01em; }
  .context { font-size:12.5px; opacity:.72; }
  .fields { display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; }
  .divider { border:0; border-top:1px solid #e3e3e3; margin:14px 0; }
  @media (prefers-color-scheme: dark) { .divider { border-top-color:#3a3d42; } }
  /* Slack renders images at ~360px wide in a message column. Showing them at
     that size is the point: a chart that is legible at 800px and mush at 360
     has still failed. */
  .img img { width:360px; max-width:100%; border-radius:6px; display:block; border:1px solid #ddd; }
  .img .alt { font-size:11px; opacity:.6; margin-top:4px; }
  code { background:rgba(29,28,29,.08); padding:1px 4px; border-radius:3px;
         font:13px/1.4 ui-monospace,Menlo,monospace; }
  pre { background:rgba(29,28,29,.06); padding:10px 12px; border-radius:6px; overflow-x:auto;
        font:12.5px/1.5 ui-monospace,Menlo,monospace; margin:6px 0; }
  @media (prefers-color-scheme: dark) { code, pre { background:rgba(255,255,255,.08); } }
  .btn { display:inline-block; border:1px solid #bbb; border-radius:4px; padding:4px 10px; font-size:13px; }
  .fallback { margin-top:22px; font-size:12.5px; opacity:.75; }
  .full { width:100%; margin-top:10px; }
  details { margin-top:22px; font-size:12px; }
</style>
<div class="wrap">
  <div class="meta">${meta} &middot; ${blocks.length} blocks &middot; ${imgCount} image(s) &middot; ${json.length} chars of JSON &middot; <b>nothing was sent</b></div>
  <div class="msg">${blocks.map(renderBlock).join("\n")}</div>
  <div class="fallback"><b>Notification / fallback text:</b><br>${mrkdwn(fallback)}</div>
  <details><summary>Raw blocks</summary><pre>${JSON.stringify(blocks, null, 2)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</pre></details>
</div>`;
}

/**
 * The per-submission hook that lands in #incoming-surveys on every completed
 * survey — the other message that reaches the team, and the one being iterated
 * on right now. Same rule: rendered, never sent.
 */
async function previewSurvey(arg: string): Promise<void> {
  const explicit = arg.includes("=") ? Number(arg.split("=")[1]) : NaN;
  let id = explicit;
  if (!Number.isFinite(id)) {
    const url = requireEnv("SUPABASE_URL");
    const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const res = await fetch(
      `${url}/rest/v1/survey_submission?status=eq.completed&select=id&order=id.desc&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    const rows = (await res.json()) as Array<{ id: number }>;
    id = rows[0]?.id ?? 0;
  }
  if (!id) {
    console.log("no completed submission found");
    return;
  }
  console.log(`building the incoming-survey hook for submission ${id}...`);
  const journey = await buildSubmissionJourney(id);
  if (!journey) {
    console.log(`submission ${id} not found`);
    return;
  }
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const cRes = await fetch(
    `${url}/rest/v1/survey_submission?id=eq.${id}&select=survey_submission_answer(count)`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  const cJson = (await cRes.json()) as Array<{
    survey_submission_answer: Array<{ count: number }>;
  }>;
  const questionCount = cJson[0]?.survey_submission_answer?.[0]?.count ?? 0;

  const msg = buildJourneyMessage(journey, { kind: "survey_completed", questionCount });
  const blocks = (msg.blocks ?? []) as Block[];
  const shot = await inlineImages(blocks);
  if (shot.ok || shot.failed) {
    console.log(`  ${shot.ok} chart(s) embedded${shot.failed ? `, ${shot.failed} FAILED` : ""}`);
  }
  const out = join(OUT_DIR, "slack-preview-survey.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    page(
      `Slack preview — incoming survey #${id}`,
      msg.text ?? "",
      blocks,
      `incoming-survey hook &middot; submission ${id} &middot; rendered ${new Date().toISOString()}`
    )
  );
  console.log(`wrote ${out}`);
  if (!process.argv.includes("--no-open")) {
    execFile("open", [out], (err) => {
      if (err) console.log(`(could not open automatically: ${err.message})`);
    });
  }
}

/**
 * The UX-review daily digest, against real production data.
 *
 * Two independent reads: PostHog for what the scanners flagged, and the
 * `ux_finding` ledger for what the probes actually concluded. The second is
 * the half that matters — the flags have been measured wrong about the
 * mechanism in 5 of 5 cases, so a digest carrying only those is a confident
 * number about nothing.
 */
async function previewUxReview(): Promise<void> {
  console.log("reading scanner flags (PostHog) and probe outcomes (ux_finding)...");
  const [stats, verification, coverage] = await Promise.all([
    fetchUxDailyStats(),
    fetchVerificationStats(),
    fetchCoverageStats(),
  ]);
  console.log(
    coverage
      ? `  ${coverage.observed} of ${coverage.submissions} finishers were watched`
      : "  NOTE: coverage could not be read — the digest will say so"
  );
  if (!verification) {
    console.log(
      "  NOTE: the ledger could not be read — the digest will say so, which is the point"
    );
  } else {
    console.log(`  ${verification.total} verified finding(s) in the last 24h`);
  }

  const msg = buildUxReviewDigest(stats, verification, coverage);
  const blocks = msg.blocks as Block[];
  const out = join(OUT_DIR, "slack-preview-ux-review.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    page(
      "Slack preview — UX review daily digest",
      msg.text,
      blocks,
      `ux-review digest &middot; rendered ${new Date().toISOString()}`
    )
  );
  console.log(`wrote ${out}`);
  if (!process.argv.includes("--no-open")) {
    execFile("open", [out], (err) => {
      if (err) console.log(`(could not open automatically: ${err.message})`);
    });
  }
}

/**
 * The WEEKLY scorecard — a different message from the daily digest above, sent
 * on Monday mornings. Previewable because it is the one that talks about
 * experiments, and a retired trial announcing itself as live is exactly the
 * kind of thing block JSON does not make obvious.
 */
async function previewScorecard(): Promise<void> {
  requireEnv("SUPABASE_URL");
  console.log("reading the 30-day scanner scorecard from PRODUCTION (read-only)...");
  // The cron's own builder, so this page is the message that goes out.
  const msg = await buildWeeklyScorecard(30);
  if (!msg) {
    console.error("the ledger could not be read — nothing to preview");
    process.exit(2);
  }
  for (const s of msg.scores) {
    console.log(
      `  ${s.scanner}: ${s.right} right, ${s.wrong} wrong, ${s.contradicted} contradicted`
    );
  }

  const out = join(OUT_DIR, "slack-preview-scorecard.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    page(
      "Slack preview — weekly scanner scorecard",
      msg.text,
      msg.blocks as Block[],
      `weekly scorecard &middot; rendered ${new Date().toISOString()}`
    )
  );
  console.log(`wrote ${out}`);
  if (!process.argv.includes("--no-open")) {
    execFile("open", [out], (err) => {
      if (err) console.log(`(could not open automatically: ${err.message})`);
    });
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`MISSING ${name} — is .env.local loaded?`);
    process.exit(2);
  }
  return v;
}

async function main(): Promise<void> {
  if (process.argv.includes("--ux-review")) {
    await previewUxReview();
    return;
  }
  if (process.argv.includes("--scorecard")) {
    await previewScorecard();
    return;
  }
  const surveyArg = process.argv.find((a) => a.startsWith("--survey"));
  if (surveyArg) {
    await previewSurvey(surveyArg);
    return;
  }
  const now = new Date();
  /**
   * BERLIN day boundaries, and the cron's own snap-back — not UTC midnight and a
   * flat 30x86,400,000. The cron reports Berlin days; a preview on UTC days sits
   * an hour or two off every bound and lands a different day either side of a
   * DST change, so it previews numbers the real message will not print.
   */
  const dayKey = reportingDay(now);
  const dayStart = reportingDayStart(dayKey);
  const windowStart = reportingDayStart(
    reportingDay(new Date(dayStart.getTime() - WINDOW_DAYS * 86_400_000))
  ).toISOString();
  const windowEnd = dayStart.toISOString();

  console.log(`reading production data for ${dayKey} (${WINDOW_DAYS}-day window)...`);
  const [
    funnel,
    cohorts,
    startFunnel,
    axisRows,
    cvrSnap,
    friction,
    midway,
    paywall,
    emailExperiments,
    unitEconomics,
  ] = await Promise.all([
    fetchLandingArmFunnel(windowStart, windowEnd),
    fetchArmCohorts(windowStart, windowEnd),
    fetchLandingStartFunnel(windowStart, windowEnd),
    fetchAxisFunnelDaily(windowStart, windowEnd),
    fetchFunnelCvrSparklines(windowStart, windowEnd),
    buildFrictionReport(windowStart, windowEnd, surveyQuestionNames()),
    // The SAME threshold the cron uses, imported rather than retyped: a preview
    // computed at a different midway point is a preview of a different message.
    fetchMidwayProgress(windowStart, windowEnd, MIDWAY_QUESTION_INDEX),
    fetchPaywallHits(windowStart, windowEnd),
    fetchEmailExperimentResults(windowStart, windowEnd),
    /**
     * Real ad spend. `adCostByDay` reads the `ga4` chunks out of Supabase, which
     * this script already has a key for — no Google credential involved — so the
     * preview shows the break-even figures the message will actually carry.
     */
    adCostByDay()
      .catch(() => ({ byDay: new Map<string, number>(), from: null, to: null }))
      .then((ad) => fetchUnitEconomics(ad, windowStart, windowEnd, WINDOW_DAYS)),
  ]);

  // adSpend deliberately null: GA4 needs a service-account credential this
  // script does not load, and a fabricated 0 would read as "we spent nothing".
  const digest = await buildConversionDigest({
    dayKey,
    funnel,
    cohorts,
    startFunnel,
    axisRows,
    cvrDays: cvrSnap?.days ?? null,
    adSpend: null,
    friction,
    midway,
    paywall,
    emailExperiments,
    unitEconomics,
    now,
  });

  console.log("rendering charts...");
  const shot = await inlineImages(digest.blocks as Block[]);
  console.log(`  ${shot.ok} chart(s) embedded${shot.failed ? `, ${shot.failed} FAILED` : ""}`);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    page(
      `Slack preview — conversion digest ${dayKey}`,
      digest.text,
      digest.blocks as Block[],
      `conversion-digest &middot; ${dayKey} &middot; rendered ${now.toISOString()}`
    )
  );
  console.log(`wrote ${OUT}`);
  if (digest.trimmed) console.log("NOTE: blocks were TRIMMED to fit Slack's limits");

  if (!process.argv.includes("--no-open")) {
    execFile("open", [OUT], (err) => {
      if (err) console.log(`(could not open automatically: ${err.message})`);
    });
  }
}

await main();
