const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

// ─── Paths ─────────────────────────────────────────────────────────────────────
const csvPath = path.join(__dirname, "..", "data", "survey-source.csv");
const tsPath = path.join(__dirname, "..", "data", "survey-data.ts");

// ─── Parse scale labels from hover states ────────────────────────────────────
// New CSV has labels in "Hover states" column: "1 = X · 2 = Y · ... · 7 = Z"
// Extract low (1) and high (7) labels.
function parseScaleLabelsFromHoverStates(hoverText) {
  if (!hoverText || hoverText.trim() === "") return null;
  const parsed = parseHoverStates(hoverText);
  if (parsed && parsed[1] && parsed[7]) {
    return { low: parsed[1], high: parsed[7] };
  }
  return null;
}

// ─── Fallback: parse scale labels from "1 = X → 7 = Y" pattern ──────────────
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
      .map((s) => s.replace(/^[""\u201C]|[""\u201D]$/g, "")) // strip smart quotes
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
function mapAnswerType(raw, answerOptions) {
  if (!raw || raw.trim() === "") return null;
  const t = raw.trim().toLowerCase();
  if (t === "open response") return "open";
  if (t === "1-7 scale") return "scale";
  if (t === "single choice") {
    // Detect country list
    if (answerOptions && answerOptions.trim().toLowerCase() === "country list") {
      return "country";
    }
    return "single";
  }
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
function detectPlaceholder(defaultInput, options, question) {
  // Use "Default input / placeholder" column if provided and not N/A
  if (defaultInput && defaultInput.trim() !== "" && defaultInput.trim().toLowerCase() !== "n/a") {
    return defaultInput.trim();
  }
  // Fallback to old detection logic
  const lower = (options || "").toLowerCase();
  if (lower.includes("email")) return "your@email.com";
  if (lower.includes("free text") || lower.includes("text")) return "Type your answer…";
  return "Type your answer…";
}

// ─── Parse "Answer option(s) explained" column ──────────────────────────────────
// For scale: "1 = very dissatisfied: explanation text. 4 = mixed: explanation. 7 = very satisfied: explanation."
// For choice: "Option title = explanation text. Another option = explanation."
function parseAnswerOptionsExplained(text) {
  if (!text || text.trim() === "" || text.trim().toLowerCase() === "n/a") return null;

  const trimmed = text.trim();
  const results = [];

  // Pattern: "N = label: explanation" separated by periods followed by space+digit
  // or "Option title = explanation" separated by periods followed by a capital letter
  // Try splitting by the pattern: digit + space + "=" which starts a new entry (for scales)
  // e.g. "1 = very dissatisfied: your current... 4 = mixed or neutral: some parts... 7 = very satisfied: your current..."

  // Split on boundary between entries: look for ". " followed by a digit and " ="
  // or a newline-separated format
  const entries = trimmed.split(/(?<=\.)\s+(?=\d+\s*=)/);

  if (entries.length > 1) {
    // Scale format: "1 = label: explanation"
    for (const entry of entries) {
      const match = entry.match(/^(\d+\s*=\s*[^:]+?):\s*(.+)$/s);
      if (match) {
        results.push({
          option: match[1].trim(),
          explanation: match[2].trim().replace(/\.$/, ""),
        });
      }
    }
    if (results.length > 0) return results;
  }

  // Choice format: "Option title = explanation. Another option = explanation."
  // Split on ". " followed by a capital letter OR a digit so options that
  // start with a number (e.g. "1–3 months", "1:1 professional support",
  // "6–12 months") aren't merged into the previous option's explanation.
  const choiceEntries = trimmed.split(/(?<=\.)\s+(?=[A-Z\d])/);
  if (choiceEntries.length > 1) {
    for (const entry of choiceEntries) {
      const match = entry.match(/^(.+?)\s*=\s*(.+)$/s);
      if (match) {
        results.push({
          option: match[1].trim(),
          explanation: match[2].trim().replace(/\.$/, ""),
        });
      }
    }
    if (results.length > 0) return results;
  }

  // Single entry fallback
  const singleMatch = trimmed.match(/^(.+?)\s*=\s*(.+)$/s);
  if (singleMatch) {
    results.push({
      option: singleMatch[1].trim(),
      explanation: singleMatch[2].trim().replace(/\.$/, ""),
    });
    return results;
  }

  return null;
}

// ─── Parse "Hover states" column ────────────────────────────────────────────────
// Format: "1 = Very dissatisfied · 2 = Dissatisfied · 3 = Slightly dissatisfied · ..."
// Returns: { 1: "Very dissatisfied", 2: "Dissatisfied", ... }
function parseHoverStates(text) {
  if (!text || text.trim() === "" || text.trim().toLowerCase() === "n/a") return null;

  const trimmed = text.trim();
  const parts = trimmed.split(/\s*·\s*|\s*\n\s*/);
  const result = {};
  let hasEntries = false;

  for (const part of parts) {
    const clean = part.trim();
    if (!clean) continue;
    const match = clean.match(/^(\d+)\s*=\s*(.+)$/);
    if (match) {
      result[parseInt(match[1], 10)] = match[2].trim();
      hasEntries = true;
    }
  }

  return hasEntries ? result : null;
}

// ─── Clean text: normalize N/A to empty ─────────────────────────────────────────
function cleanText(val) {
  if (!val) return "";
  const trimmed = val.trim();
  if (trimmed.toLowerCase() === "n/a") return "";
  return trimmed.replace(/\r\n?/g, "\n");
}

function parseMaxSelections(val) {
  if (!val) return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed.toLowerCase() === "n/a") return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

  for (const row of records) {
    const qId = (row["Q_ID"] || "").trim();
    const cId = parseInt(row["C_ID"], 10);
    const chapter = (row["Category & chapter"] || "").trim();
    const question = (row["Question"] || row["Question "] || "")
      .trim()
      .replace(/\s*\[update\]\s*$/i, "");
    const answerOptions = (row["Answer options"] || row["Answer Options"] || "").trim();
    const answerTypeRaw = (row["Answer format"] || row["Answer Type"] || "").trim();
    const howAnswerIsUsed = cleanText(row["How this answer will be used"] || row["Comment"] || "");
    const required = true;
    const supportAndGuidance = cleanText(
      row["Support and guidance"] || row["Guide (display)"] || ""
    );
    const formatGuidance = cleanText(row["Answer format guidance"] || "");
    const maxSelections = parseMaxSelections(row["Max selections"] || "");
    const defaultInput = cleanText(row["Default input / placeholder"] || "");
    const answerOptionsExplainedRaw = cleanText(row["Answer option(s) explained"] || "");
    const hoverStatesRaw = cleanText(row["Hover states"] || "");
    const backgroundInfo = cleanText(row["Background info"] || "");

    if (isNaN(cId)) continue;

    const answerType = mapAnswerType(answerTypeRaw, answerOptions);

    // Rows without an answer type are descriptive chapter-intro rows in the
    // source CSV. They used to feed a `chapterIntros` array; that data was
    // never consumed in production, so the rows are skipped silently now.
    if (!answerType) {
      continue;
    }

    const q = {
      qId,
      cId,
      chapter,
      question,
      answerType,
      options:
        answerType === "scale" || answerType === "country" ? [] : parseOptions(answerOptions),
      required,
      guide: supportAndGuidance,
      supportAndGuidance,
    };

    // Scale labels — prefer hover states, fallback to answer options pattern
    if (answerType === "scale") {
      const labelsFromHover = parseScaleLabelsFromHoverStates(hoverStatesRaw);
      if (labelsFromHover) {
        q.scaleLabels = labelsFromHover;
      } else {
        const labels = parseScaleLabels(answerOptions);
        if (labels) {
          q.scaleLabels = labels;
        }
      }
    }

    // Open response fields
    if (answerType === "open") {
      q.inputType = detectInputType(answerOptions, question);
      q.placeholder = detectPlaceholder(defaultInput, answerOptions, question);
    }

    // Comment / howAnswerIsUsed (backward compat: both fields populated)
    if (howAnswerIsUsed) {
      q.comment = howAnswerIsUsed;
      q.howAnswerIsUsed = howAnswerIsUsed;
    }

    // Format guidance
    if (formatGuidance) {
      q.formatGuidance = formatGuidance;
    }

    if (answerType === "multiple" && maxSelections) {
      q.maxSelections = maxSelections;
    }

    // Answer options explained
    const parsedExplained = parseAnswerOptionsExplained(answerOptionsExplainedRaw);
    if (parsedExplained) {
      q.answerOptionsExplained = parsedExplained;
    }

    // Hover states
    const parsedHover = parseHoverStates(hoverStatesRaw);
    if (parsedHover) {
      q.hoverStates = parsedHover;
    }

    questions.push(q);
  }

  // Sort by Q_ID string
  questions.sort((a, b) => a.qId.localeCompare(b.qId));

  console.log(`Questions: ${questions.length}`);

  // ─── Generate TypeScript ────────────────────────────────────────────────────
  let output = `// Auto-generated from data/survey-source.csv — do not edit manually
// Run: node scripts/update-survey.js

export type AnswerType = "open" | "scale" | "single" | "multiple" | "country";

export interface AnswerOptionExplained {
  option: string;
  explanation: string;
}

export interface SurveyQuestion {
  qId: string;
  cId: number;
  chapter: string;
  question: string;
  answerType: AnswerType;
  options: string[];
  required: boolean;
  guide: string;
  supportAndGuidance: string;
  scaleLabels?: { low: string; high: string };
  inputType?: "email" | "text";
  placeholder?: string;
  comment?: string;
  howAnswerIsUsed?: string;
  answerOptionsExplained?: AnswerOptionExplained[];
  hoverStates?: Record<number, string>;
  formatGuidance?: string;
  maxSelections?: number;
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
    output += `    supportAndGuidance: ${JSON.stringify(q.supportAndGuidance)},\n`;
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
    if (q.howAnswerIsUsed) {
      output += `    howAnswerIsUsed: ${JSON.stringify(q.howAnswerIsUsed)},\n`;
    }
    if (q.answerOptionsExplained) {
      output += `    answerOptionsExplained: ${JSON.stringify(q.answerOptionsExplained)},\n`;
    }
    if (q.hoverStates) {
      output += `    hoverStates: ${JSON.stringify(q.hoverStates)},\n`;
    }
    if (q.formatGuidance) {
      output += `    formatGuidance: ${JSON.stringify(q.formatGuidance)},\n`;
    }
    if (q.maxSelections) {
      output += `    maxSelections: ${q.maxSelections},\n`;
    }
    output += `  }${comma}\n`;
  }

  output += `];\n`;

  fs.writeFileSync(tsPath, output, "utf-8");
  console.log(`\nWritten ${tsPath}`);
  console.log(`  ${questions.length} questions`);
}

main();
