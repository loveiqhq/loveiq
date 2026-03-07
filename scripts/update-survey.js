const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

// ─── Paths ─────────────────────────────────────────────────────────────────────
const csvPath = path.join(__dirname, "..", "data", "survey-source.csv");
const tsPath = path.join(__dirname, "..", "data", "survey-data.ts");

// ─── Parse scale labels from "1 = X → 7 = Y" pattern ───────────────────────────
function parseScaleLabels(text) {
  const match = text.match(/1\s*=\s*(.+?)\s*→\s*7\s*=\s*(.+)/);
  if (!match) return null;
  return { low: match[1].trim(), high: match[2].trim() };
}

// ─── Parse answer options into array ────────────────────────────────────────────
function parseOptions(text) {
  if (!text || text.trim() === "") return [];

  const trimmed = text.trim();

  // Multi-line: split by newlines
  if (trimmed.includes("\n")) {
    return trimmed
      .split("\n")
      .map((s) => s.trim())
      .map((s) => s.replace(/^-\s*/, "")) // strip leading "- "
      .map((s) => s.replace(/^[""]|[""]$/g, "")) // strip smart quotes
      .filter((s) => s.length > 0);
  }

  // Comma-separated (only if multiple commas suggest a list)
  if ((trimmed.match(/,/g) || []).length >= 1) {
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  // Single value
  return [trimmed];
}

// ─── Map answer type string to enum ─────────────────────────────────────────────
function mapAnswerType(raw) {
  if (!raw || raw.trim() === "") return null;
  const t = raw.trim().toLowerCase();
  if (t === "open response") return "open";
  if (t === "1-7 scale") return "scale";
  if (t === "single choice") return "single";
  if (t === "multiple choice") return "multiple";
  return null;
}

// ─── Detect input type for open response ────────────────────────────────────────
function detectInputType(options, question) {
  const lower = (options || "").toLowerCase();
  if (lower.includes("email")) return "email";
  return "text";
}

// ─── Detect placeholder for open response ───────────────────────────────────────
function detectPlaceholder(options, question) {
  const lower = (options || "").toLowerCase();
  if (lower.includes("email")) return "your@email.com";
  if (lower.includes("free text") || lower.includes("text")) return "Type your answer...";
  return "Type your answer...";
}

// ─── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
  });

  console.log(`CSV: Parsed ${records.length} records`);

  const questions = [];
  const chapterIntros = [];

  for (const row of records) {
    const qId = (row["Q_ID"] || "").trim();
    const cId = parseInt(row["C_ID"], 10);
    const chapter = (row["Category & chapter"] || "").trim();
    const question = (row["Question"] || row["Question "] || "").trim();
    const answerOptions = (row["Answer Options"] || "").trim();
    const answerTypeRaw = (row["Answer Type"] || "").trim();
    const comment = (row["Comment"] || "").trim();
    const required = (row["Required"] || "").trim().toLowerCase() === "yes";
    const guide = (row["Guide (display)"] || "").trim();

    if (isNaN(cId)) continue;

    const answerType = mapAnswerType(answerTypeRaw);

    // Chapter intro: no answer type
    if (!answerType) {
      // Build intro text from the question/description field + answerOptions
      const introText = [question, answerOptions].filter(Boolean).join("\n\n");
      chapterIntros.push({ cId, chapter, text: introText });
      continue;
    }

    const q = {
      qId,
      cId,
      chapter,
      question,
      answerType,
      options: answerType === "scale" ? [] : parseOptions(answerOptions),
      required,
      guide,
    };

    // Add subtitle if question contains comma-separated sub-sentence
    // (not adding subtitle for now, can be done later)

    // Scale labels
    if (answerType === "scale") {
      const labels = parseScaleLabels(answerOptions);
      if (labels) {
        q.scaleLabels = labels;
      }
    }

    // Open response fields
    if (answerType === "open") {
      q.inputType = detectInputType(answerOptions, question);
      q.placeholder = detectPlaceholder(answerOptions, question);
    }

    // Comment field (how answer is used)
    if (comment) {
      q.comment = comment;
    }

    questions.push(q);
  }

  // Sort by Q_ID string
  questions.sort((a, b) => a.qId.localeCompare(b.qId));
  chapterIntros.sort((a, b) => a.cId - b.cId);

  console.log(`Questions: ${questions.length}`);
  console.log(`Chapter intros: ${chapterIntros.length}`);

  // ─── Generate TypeScript ────────────────────────────────────────────────────
  let output = `// Auto-generated from data/survey-source.csv — do not edit manually
// Run: node scripts/update-survey.js

export type AnswerType = "open" | "scale" | "single" | "multiple";

export interface SurveyQuestion {
  qId: string;
  cId: number;
  chapter: string;
  question: string;
  answerType: AnswerType;
  options: string[];
  required: boolean;
  guide: string;
  scaleLabels?: { low: string; high: string };
  inputType?: "email" | "text";
  placeholder?: string;
  comment?: string;
}

export interface ChapterIntro {
  cId: number;
  chapter: string;
  text: string;
}

export const surveyQuestions: SurveyQuestion[] = [\n`;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const comma = i < questions.length - 1 ? "," : "";
    output += `  {\n`;
    output += `    qId: ${JSON.stringify(q.qId)},\n`;
    output += `    cId: ${q.cId},\n`;
    output += `    chapter: ${JSON.stringify(q.chapter)},\n`;
    output += `    question: ${JSON.stringify(q.question)},\n`;
    output += `    answerType: ${JSON.stringify(q.answerType)},\n`;
    output += `    options: ${JSON.stringify(q.options)},\n`;
    output += `    required: ${q.required},\n`;
    output += `    guide: ${JSON.stringify(q.guide)},\n`;
    if (q.scaleLabels) {
      output += `    scaleLabels: { low: ${JSON.stringify(q.scaleLabels.low)}, high: ${JSON.stringify(q.scaleLabels.high)} },\n`;
    }
    if (q.inputType) {
      output += `    inputType: ${JSON.stringify(q.inputType)},\n`;
    }
    if (q.placeholder) {
      output += `    placeholder: ${JSON.stringify(q.placeholder)},\n`;
    }
    if (q.comment) {
      output += `    comment: ${JSON.stringify(q.comment)},\n`;
    }
    output += `  }${comma}\n`;
  }

  output += `];\n\nexport const chapterIntros: ChapterIntro[] = [\n`;

  for (let i = 0; i < chapterIntros.length; i++) {
    const c = chapterIntros[i];
    const comma = i < chapterIntros.length - 1 ? "," : "";
    output += `  {\n`;
    output += `    cId: ${c.cId},\n`;
    output += `    chapter: ${JSON.stringify(c.chapter)},\n`;
    output += `    text: ${JSON.stringify(c.text)},\n`;
    output += `  }${comma}\n`;
  }

  output += `];\n`;

  fs.writeFileSync(tsPath, output, "utf-8");
  console.log(`\nWritten ${tsPath}`);
  console.log(`  ${questions.length} questions`);
  console.log(`  ${chapterIntros.length} chapter intros`);
}

main();
