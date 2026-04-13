const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const SCORES_DOC_PATH = path.join(ROOT, "27 - Typical Sexual Fantasy & Practice Tendencies (1).docx");
const EXPLANATIONS_DOC_PATH = path.join(
  ROOT,
  "[NOT IN USE - EXPLANATIONS INCLUDED] 27 - Typical Sexual Fantasy & Practice Tendencies.docx"
);

function cleanHtml(html) {
  return html
    .replace(/<a id="[^"]*"><\/a>/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function stripTags(html) {
  return cleanHtml(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function normalizePracticeKey(value) {
  return stripTags(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractBlocks(html) {
  return cleanHtml(html).match(/<(h2|p|ul|ol|table)\b[\s\S]*?<\/\1>/gi) ?? [];
}

function splitBySectionHeading(html) {
  const cleaned = cleanHtml(html);
  const matches = [...cleaned.matchAll(/<h2>Typical Sexual Fantasy[\s\S]*?<\/h2>/gi)];

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? cleaned.length) : cleaned.length;
    return cleaned.slice(start, end);
  });
}

function extractArchetypeName(headingHtml) {
  const headingText = stripTags(headingHtml);
  const match = headingText.match(/(?:of the|for)\s+(.+)$/i);

  if (!match) {
    throw new Error(`Unable to resolve archetype from heading: ${headingText}`);
  }

  return match[1].trim();
}

function parseTableRows(tableHtml, expectedCellCount) {
  const rows = [...tableHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);

  return rows
    .slice(1)
    .map((rowHtml) =>
      [...rowHtml.matchAll(/<t[hd]>([\s\S]*?)<\/t[hd]>/gi)].map((match) =>
        stripTags(match[1]).replace(/\s+/g, " ").trim()
      )
    )
    .filter((cells) => cells.length === expectedCellCount);
}

function parseScoreSection(sectionHtml) {
  const blocks = extractBlocks(sectionHtml);
  const headingHtml = blocks.shift();
  if (!headingHtml) {
    throw new Error("Missing section heading in practice tendencies score document.");
  }

  const archetype = extractArchetypeName(headingHtml);
  const introBlocks = [];
  const groups = [];
  let pendingTitle = "";
  let pendingTitleBlock = null;
  let sawTable = false;

  for (const block of blocks) {
    if (/^<table\b/i.test(block)) {
      if (pendingTitle) {
        if (!sawTable && pendingTitleBlock) {
          const introIndex = introBlocks.indexOf(pendingTitleBlock);
          if (introIndex !== -1) {
            introBlocks.splice(introIndex, 1);
          }
        }

        groups.push({
          title: pendingTitle,
          rows: parseTableRows(block, 3).map(([practice, fantasyPull, actualPleasure]) => ({
            practice,
            fantasyPull: Number.parseInt(fantasyPull, 10),
            actualPleasure: Number.parseInt(actualPleasure, 10),
          })),
        });
      }

      pendingTitle = "";
      pendingTitleBlock = null;
      sawTable = true;
      continue;
    }

    const text = stripTags(block).replace(/\s+/g, " ").trim();
    if (!text) continue;

    pendingTitle = text;
    pendingTitleBlock = block;

    if (!sawTable) {
      introBlocks.push(block);
    }
  }

  return {
    archetype,
    introBlocks: introBlocks.filter((block) => stripTags(block)).map((block) => cleanHtml(block)),
    groups,
  };
}

function normalizeGroupTitle(value) {
  return value.replace(/\s+Tendencies$/i, "").trim();
}

function parseExplanationSection(sectionHtml) {
  const blocks = extractBlocks(sectionHtml);
  const headingHtml = blocks.shift();
  if (!headingHtml) {
    throw new Error("Missing section heading in practice tendencies explanation document.");
  }

  const archetype = extractArchetypeName(headingHtml);
  const groups = [];
  let pendingTitle = "";

  for (const block of blocks) {
    if (/^<table\b/i.test(block)) {
      if (pendingTitle) {
        groups.push({
          title: normalizeGroupTitle(pendingTitle),
          rows: parseTableRows(block, 4).map(([practice, description]) => ({
            practice,
            description,
          })),
        });
      }

      pendingTitle = "";
      continue;
    }

    const text = stripTags(block).replace(/\s+/g, " ").trim();
    if (text) {
      pendingTitle = text;
    }
  }

  return { archetype, groups };
}

function buildExplanationLookup(groups) {
  return Object.fromEntries(
    groups.map((group) => [
      normalizePracticeKey(group.title),
      Object.fromEntries(
        group.rows.map((row) => [normalizePracticeKey(row.practice), row.description])
      ),
    ])
  );
}

async function main() {
  const scoreResult = await mammoth.convertToHtml({ path: SCORES_DOC_PATH });
  const explanationResult = await mammoth.convertToHtml({ path: EXPLANATIONS_DOC_PATH });

  const scoreSections = splitBySectionHeading(scoreResult.value).map(parseScoreSection);
  const explanationSections = splitBySectionHeading(explanationResult.value).map(parseExplanationSection);

  const explanationsByArchetype = Object.fromEntries(
    explanationSections.map((section) => [section.archetype, buildExplanationLookup(section.groups)])
  );

  const output = Object.fromEntries(
    scoreSections.map((section) => {
      const explanationLookup = explanationsByArchetype[section.archetype];
      if (!explanationLookup) {
        throw new Error(`Missing explanation content for archetype "${section.archetype}".`);
      }

      return [
        section.archetype,
        {
          introBlocks: section.introBlocks,
          groups: section.groups.map((group) => {
            const groupLookup = explanationLookup[normalizePracticeKey(group.title)];
            if (!groupLookup) {
              throw new Error(
                `Missing explanation group "${group.title}" for archetype "${section.archetype}".`
              );
            }

            return {
              title: group.title,
              rows: group.rows.map((row) => ({
                ...row,
                description: groupLookup[normalizePracticeKey(row.practice)] ?? null,
              })),
            };
          }),
        },
      ];
    })
  );

  const fileContents = `// Auto-generated from practice tendency .docx files — do not edit manually.
// Run: node scripts/generate-practice-tendencies.js

export interface ReportPracticeTendencyRow {
  practice: string;
  fantasyPull: number;
  actualPleasure: number;
  description: string | null;
}

export interface ReportPracticeTendencyGroup {
  title: string;
  rows: ReportPracticeTendencyRow[];
}

export interface ReportPracticeTendencyContent {
  introBlocks: string[];
  groups: ReportPracticeTendencyGroup[];
}

export const reportPracticeTendencies: Record<string, ReportPracticeTendencyContent> = ${JSON.stringify(
    output,
    null,
    2
  )};
`;

  fs.writeFileSync(path.join(DATA_DIR, "report-practice-tendencies.ts"), fileContents, "utf8");
  console.log("Generated data/report-practice-tendencies.ts");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
