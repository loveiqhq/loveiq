const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

// ─── Paths ─────────────────────────────────────────────────────────────────────
const dataDir = path.join(__dirname, "..", "data", "product-kpis");
const tsPath = path.join(__dirname, "..", "data", "product-kpis.ts");

// ─── Helpers ────────────────────────────────────────────────────────────────────
function readCsv(filename, { skipFirstRow = false } = {}) {
  const filePath = path.join(dataDir, filename);
  let content = fs.readFileSync(filePath, "utf-8");

  // Some CSVs have a title row before the header row — skip it
  if (skipFirstRow) {
    const firstNewline = content.indexOf("\n");
    if (firstNewline !== -1) {
      content = content.slice(firstNewline + 1);
    }
  }

  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
  });
}

function toFloat(v) {
  if (v == null || v === "") return null;
  // Strip % suffix
  const cleaned = String(v).replace(/%$/, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toInt(v) {
  if (v == null || v === "") return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

// ─── Parse Report Sections ──────────────────────────────────────────────────────
function parseReportSections() {
  const rows = readCsv("report-sections.csv", { skipFirstRow: true });
  return rows
    .filter((r) => r["#"] && r["Section"])
    .map((r) => ({
      index: toInt(r["#"]),
      section: (r["Section"] || "").trim(),
      reachN: toInt(r["reach_n"]),
      dropoffN: toInt(r["dropoff_n"]),
      avgActiveTimeS: toFloat(r["avg_active_time_s"]),
      scrollCompleteN: toInt(r["scroll_complete_n"]),
      backtrackN: toInt(r["backtrack_n"]),
      errorN: toInt(r["error_n"]),
      ctaUnlockN: toInt(r["cta_unlock_n"]),
      ctaReadMoreN: toInt(r["cta_read_more_n"]),
      ctaNewSurveyN: toInt(r["cta_new_survey_n"]),
      skipN: toInt(r["skip_n"]),
      reachPct: toFloat(r["reach_%"]),
      dropoffPct: toFloat(r["dropoff_%"]),
      scrollCompletePct: toFloat(r["scroll_complete_%"]),
      backtrackPct: toFloat(r["backtrack_%"]),
      errorPct: toFloat(r["error_%"]),
      ctaUnlockPct: toFloat(r["cta_unlock_%"]),
      ctaReadMorePct: toFloat(r["cta_read_more_%"]),
      ctaNewSurveyPct: toFloat(r["cta_new_survey_%"]),
      skipPct: toFloat(r["skip_%"]),
      frictionIndex: toFloat(r["friction_index"]),
    }));
}

// ─── Parse Questions ────────────────────────────────────────────────────────────
function parseQuestions() {
  const rows = readCsv("questions.csv", { skipFirstRow: true });
  return rows
    .filter((r) => r["Q_ID"] && r["Question"])
    .map((r) => ({
      qId: (r["Q_ID"] || "").trim(),
      cId: (r["C_ID"] || "").trim(),
      question: (r["Question"] || r["Question "] || "").trim(),
      reachN: toInt(r["reach_n"]),
      dropoffN: toInt(r["dropoff_n"]),
      avgActiveTimeS: toFloat(r["avg_active_time_s"]),
      backtrackN: toInt(r["backtrack_n"]),
      guidanceTooltipOpenN: toInt(r["guidance_tooltip_open_n"]),
      errorN: toInt(r["error_n"]),
      reachPct: toFloat(r["reach_%"]),
      dropoffPct: toFloat(r["dropoff_%"]),
      backtrackPct: toFloat(r["backtrack_%"]),
      guidanceTooltipOpenPct: toFloat(r["guidance_tooltip_open_%"]),
      errorPct: toFloat(r["error_%"]),
      frictionIndex: toFloat(r["friction_index"]),
    }));
}

// ─── Parse Chapters ─────────────────────────────────────────────────────────────
function parseChapters() {
  // Chapters CSV: row 1 IS the header (no title row)
  const rows = readCsv("chapters.csv");
  return rows
    .filter((r) => r["C_ID"])
    .map((r) => ({
      cId: (r["C_ID"] || "").trim(),
      chapterName: (r["Chapter name"] || "").trim(),
      numQsNonIntro: toInt(r["Number of Qs (non-intro)"]),
      numQsIys: toInt(r["Number of Qs IYS"]),
      entryN: toInt(r["entry_n"]),
      lastReachN: toInt(r["last_reach_n"]),
      dropoffNSum: toInt(r["dropoff_n_sum"]),
      completionPct: toFloat(r["completion_%"]),
      dropoffPct: toFloat(r["dropoff_%"]),
      timePerEntryS: toFloat(r["time_per_entry_s"]),
      backtrackPct: toFloat(r["backtrack_%"]),
      frictionIndex: toFloat(r["friction_index"]),
    }));
}

// ─── Generate TypeScript ────────────────────────────────────────────────────────
function main() {
  const reportSections = parseReportSections();
  const questions = parseQuestions();
  const chapters = parseChapters();

  const output = `// Auto-generated from data/product-kpis/ — do not edit manually
// Run: node scripts/update-product-kpis.js

// ─── Report Sections (${reportSections.length}) ──────────────────────────────────
export interface ReportSectionKpi {
  index: number | null;
  section: string;
  reachN: number | null;
  dropoffN: number | null;
  avgActiveTimeS: number | null;
  scrollCompleteN: number | null;
  backtrackN: number | null;
  errorN: number | null;
  ctaUnlockN: number | null;
  ctaReadMoreN: number | null;
  ctaNewSurveyN: number | null;
  skipN: number | null;
  reachPct: number | null;
  dropoffPct: number | null;
  scrollCompletePct: number | null;
  backtrackPct: number | null;
  errorPct: number | null;
  ctaUnlockPct: number | null;
  ctaReadMorePct: number | null;
  ctaNewSurveyPct: number | null;
  skipPct: number | null;
  frictionIndex: number | null;
}

export const reportSections: ReportSectionKpi[] = ${JSON.stringify(reportSections, null, 2)};

// ─── Questions (${questions.length}) ──────────────────────────────────────────────
export interface QuestionKpi {
  qId: string;
  cId: string;
  question: string;
  reachN: number | null;
  dropoffN: number | null;
  avgActiveTimeS: number | null;
  backtrackN: number | null;
  guidanceTooltipOpenN: number | null;
  errorN: number | null;
  reachPct: number | null;
  dropoffPct: number | null;
  backtrackPct: number | null;
  guidanceTooltipOpenPct: number | null;
  errorPct: number | null;
  frictionIndex: number | null;
}

export const questions: QuestionKpi[] = ${JSON.stringify(questions, null, 2)};

// ─── Chapters (${chapters.length}) ───────────────────────────────────────────────
export interface ChapterKpi {
  cId: string;
  chapterName: string;
  numQsNonIntro: number | null;
  numQsIys: number | null;
  entryN: number | null;
  lastReachN: number | null;
  dropoffNSum: number | null;
  completionPct: number | null;
  dropoffPct: number | null;
  timePerEntryS: number | null;
  backtrackPct: number | null;
  frictionIndex: number | null;
}

export const chapters: ChapterKpi[] = ${JSON.stringify(chapters, null, 2)};
`;

  fs.writeFileSync(tsPath, output, "utf-8");

  console.log("Written " + tsPath);
  console.log("  Report sections: " + reportSections.length);
  console.log("  Questions: " + questions.length);
  console.log("  Chapters: " + chapters.length);
}

main();
