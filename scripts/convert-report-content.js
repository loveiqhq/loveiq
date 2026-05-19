/**
 * Convert report .docx files to TypeScript data files.
 *
 * Reads:
 *   [WIP - MAIN] Report Template - General.docx   — section structure + general text
 *   3 - Core Archetype.docx, 5 - Core Motivation.docx, etc. — archetype-specific text
 *
 * Writes:
 *   data/report-general.ts      — 32 section definitions with general content (HTML)
 *   data/report-archetypes.ts   — archetype-specific content keyed by block ID + archetype name
 *
 * Run:  node scripts/convert-report-content.js
 */

const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");

// ─── Config ───────────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, "..");
const TEMPLATE_PATH = path.join(ROOT, "[WIP - MAIN] Report Template - General.docx");
const DATA_DIR = path.join(ROOT, "data");

/** Map from archetype block ID → source .docx filename (number prefix). */
const BLOCK_FILE_MAP = {
  core_archetype: "3 - Core Archetype.docx",
  motivation: "5 - Core Motivation.docx",
  attachment: "8 - Attachment Style.docx",
  insecurities: "9 - Core Insecurities.docx",
  confidence: "10 - Confidence Level.docx",
  beliefs: "11 - Typical Beliefs.docx",
  reward_system: "12 - Biochemical Reward System Dynamics.docx",
  energy: "13 - Energy Level.docx",
  risk: "14 - Risk Orientation.docx",
  power: "15 - Power Orientation.docx",
  curiosity: "16 - Curiosity Level.docx",
  relationship_form: "17 - Relationship Form Preference.docx",
  communication: "18 - Communication Style.docx",
  love_language: "19 - Love Language.docx",
  arousal_style: "21 - Arousal Style.docx",
  initiation: "22 - Initiation Style.docx",
  turn_ons: "23 - Arousal Accelerators (Turn-ons).docx",
  turn_offs: "24 - Arousal Brakes (Turn-offs).docx",
  practices: "27 - Typical Sexual Fantasy & Practice Tendencies.docx",
  libido: "28 - Libido Challenges in Relationships.docx",
  challenges_enjoy: "29 - Challenges to Enjoy Sex.docx",
  challenges_sustain: "30 - Challenges to Sustain Partner.docx",
  growth: "31 - Growth Potentials.docx",
  recommendations: "32 - Recommendations.docx",
};

const ARCHETYPES = [
  "Sensual Connector",
  "Spark Seeker",
  "Relational Nurturer",
  "Radiant Performer",
  "Explorer of Edges",
  "Curious Apprentice",
  "Spiritual Lover",
  "Minimalist Companion",
  "Emotional Voyeur",
  "Authority Conductor",
  "Loyal Ritualist",
  "Tender Devotee",
  "Analytical Sexualist",
  "Quiet Withdrawer",
];

/** Sections that show premium overlay on archetype-specific content (from Figma). */
const PREMIUM_SECTIONS = new Set([
  5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 27, 28, 29, 30, 31, 32,
]);

/** Sections that do NOT show "Does this resonate?" feedback. */
const NO_FEEDBACK_SECTIONS = new Set([1]); // Welcome has its own layout

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a section title to a stable slug ID. */
function slugify(title) {
  return title
    .replace(/^\d+\s*/, "") // strip leading number
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Clean up mammoth HTML: remove anchor tags, trim whitespace. */
function cleanHtml(html) {
  return html
    .replace(/<a id="[^"]*"><\/a>/g, "") // remove Google Docs anchors
    .replace(
      /<a\b[^>]*href="https:\/\/docs\.google\.com\/document\/[^"]*"[^>]*>\s*(?:\d+|[*†‡]+)\s*<\/a>/gi,
      ""
    ) // remove Google Docs footnote links
    .replace(/<sup>\s*(?:<a\b[^>]*>\s*(?:\d+|[*†‡]+)\s*<\/a>|(?:\d+|[*†‡]+))\s*<\/sup>/gi, "") // remove superscript footnote markers
    .replace(
      /([?!.,:;"'")\]])\s*(?:<sup>\s*)?(?:\d+|[*†‡]+)(?:\s*<\/sup>)?(?=\s*<\/(?:p|li|h[1-6])>)/gi,
      "$1"
    ) // strip leaked trailing reference numbers
    .replace(/\u00a0/g, " ") // replace non-breaking spaces
    .replace(/[\u2018\u2019]/g, "'") // smart single quotes
    .replace(/[\u201c\u201d]/g, '"') // smart double quotes
    .replace(/\u2013/g, "\u2013") // en-dash (keep)
    .replace(/\u2014/g, "\u2014") // em-dash (keep)
    .replace(/\u2028/g, " ") // line separator
    .trim();
}

/** Split HTML into sections on <h1> tags. Returns [{heading, body}]. */
function splitOnH1(html) {
  const parts = html.split(/<h1>/);
  const sections = [];
  for (let i = 1; i < parts.length; i++) {
    const closeIdx = parts[i].indexOf("</h1>");
    if (closeIdx === -1) continue;
    const heading = cleanHtml(parts[i].substring(0, closeIdx).replace(/<[^>]+>/g, ""));
    const body = cleanHtml(parts[i].substring(closeIdx + 5));
    sections.push({ heading, body });
  }
  return sections;
}

/** Extract section number and clean title from heading like "5 Core Motivation". */
function parseHeading(heading) {
  const match = heading.match(/^(\d+)\s+(.+)$/);
  if (match) return { num: parseInt(match[1], 10), title: match[2].trim() };
  return { num: 0, title: heading.trim() };
}

/** Find [[ARCHETYPE_BLOCK_xxx]] in text and return the block ID. */
function extractBlockId(text) {
  const match = text.match(/\[\[ARCHETYPE_BLOCK_(\w+)\]\]/);
  return match ? match[1] : null;
}

/** Remove [[ARCHETYPE_BLOCK_xxx]] markers and template-note paragraphs from HTML. */
function stripBlockMarkers(html) {
  return (
    html
      // V2: bare marker. V3: marker wrapped in <em>. Match either, with or without surrounding inline tags.
      .replace(/<p>(?:<em>)?\s*\[\[ARCHETYPE_BLOCK_\w+\]\]\s*(?:<\/em>)?<\/p>/g, "")
      .replace(/<p><em>Template notes[^<]*<\/em><\/p>/g, "")
      .trim()
  );
}

function splitSequentialH1Blocks(rawHtml, orderedKeys) {
  const parts = rawHtml.split(/<h1>Core Archetype\s*<\/h1>/i).slice(1);
  const result = {};

  parts.forEach((part, index) => {
    const archetype = orderedKeys[index];
    if (!archetype) return;
    const content = cleanHtml(stripBlockMarkers(part));
    if (content) {
      result[archetype] = content;
    }
  });

  return result;
}

function findNearestOpenTag(html, pos) {
  const windowStart = Math.max(0, pos - 300);
  const preceding = html.substring(windowStart, pos);
  const openTagMatches = [...preceding.matchAll(/<(h[123]|p)[^>]*>/g)];
  const nearest = openTagMatches.at(-1);

  if (!nearest || nearest.index === undefined) return null;

  return {
    tagName: nearest[1],
    tagStart: windowStart + nearest.index,
  };
}

/**
 * Split archetype-specific .docx HTML into per-archetype content.
 *
 * Files use different heading styles:
 *   - <h1>Core Archetype</h1> per archetype (some files)
 *   - <h2>...of the Sensual Connector</h2> (e.g., practices file)
 *   - <p>...of the <strong>Sensual Connector</strong></p> (e.g., motivation file)
 *   - <p>...of the Sensual Connector</p> (e.g., recommendations file)
 *
 * Strategy: find every position where an archetype name appears in a heading-like
 * context, then extract the content between consecutive positions.
 */
function splitByArchetype(rawHtml) {
  const result = {};
  // Strip Google Docs anchor tags that break regex matching inside <p>/<h1>/<h2>
  const html = rawHtml.replace(/<a id="[^"]*"><\/a>/g, "");

  // Strategy: find the first heading-like mention of each archetype name,
  // then split the document at those positions.
  //
  // A "heading-like mention" is the first occurrence of the archetype name
  // that sits inside or immediately after a heading tag (<h1>/<h2>/<h3>)
  // or inside a short <p> that acts as a section title.

  const markers = [];

  for (const archetype of ARCHETYPES) {
    const escaped = escapeRegex(archetype);

    // Find ALL occurrences of the archetype name in the HTML
    const nameRegex = new RegExp(escaped, "g");
    let nameMatch;
    while ((nameMatch = nameRegex.exec(html)) !== null) {
      const pos = nameMatch.index;

      // Check if this occurrence is inside or just after a heading/title context:
      // 1. Inside <h1>...</h1>, <h2>...</h2>, or <h3>...</h3>
      // 2. Inside a <p> that looks like a section title (short, starts with a label)
      // 3. Inside a <p> where this is the subject (e.g., "The <strong>Archetype</strong> experiences...")

      const nearestOpenTag = findNearestOpenTag(html, pos);
      if (!nearestOpenTag) continue;

      const { tagName, tagStart } = nearestOpenTag;

      // For <h1>/<h2>/<h3>: always counts as heading context
      if (tagName.startsWith("h")) {
        // Find the end of the heading tag
        const closeTag = `</${tagName}>`;
        const closeIdx = html.indexOf(closeTag, tagStart);
        const headingEnd = closeIdx !== -1 ? closeIdx + closeTag.length : pos + archetype.length;

        markers.push({ archetype, headingStart: tagStart, headingEnd });
        break;
      }

      // For <p>: only counts if it's a title-like paragraph
      if (tagName === "p") {
        // Find the end of this <p>
        const closeIdx = html.indexOf("</p>", tagStart);
        if (closeIdx === -1) continue;
        const pContent = html.substring(tagStart, closeIdx + 4);
        const plainP = pContent.replace(/<[^>]+>/g, "");

        // Title patterns: short paragraph OR starts with "The {Archetype}" OR contains "of the/for the"
        const isTitle =
          plainP.length < 200 ||
          plainP.match(new RegExp(`^\\s*The\\s+${escaped}\\s`, "i")) ||
          plainP.match(new RegExp(`(?:of the|for the)\\s+${escaped}`, "i"));

        if (isTitle) {
          markers.push({ archetype, headingStart: tagStart, headingEnd: closeIdx + 4 });
          break;
        }
      }
    }
  }

  // Sort by position in the document
  markers.sort((a, b) => a.headingStart - b.headingStart);

  // Extract content between markers
  for (let i = 0; i < markers.length; i++) {
    const startIdx = markers[i].headingEnd;
    const endIdx = i + 1 < markers.length ? markers[i + 1].headingStart : html.length;
    const content = cleanHtml(stripBlockMarkers(html.substring(startIdx, endIdx)));
    if (content) {
      result[markers[i].archetype] = content;
    }
  }

  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Converting report .docx files to TypeScript...\n");

  // 1. Parse main template (optional — skipped if file absent, data/report-general.ts unchanged)
  const templateExists = fs.existsSync(TEMPLATE_PATH);
  let sections = [];
  if (templateExists) {
    console.log("Reading main template...");
    const templateResult = await mammoth.convertToHtml({ path: TEMPLATE_PATH });
    const templateHtml = templateResult.value;
    const rawSections = splitOnH1(templateHtml);

    for (const raw of rawSections) {
      const { num, title } = parseHeading(raw.heading);
      const blockId = extractBlockId(raw.body);
      const generalContent = stripBlockMarkers(raw.body);
      const id = slugify(raw.heading);

      sections.push({
        id,
        sectionNumber: num,
        title,
        generalContent,
        archetypeBlockId: blockId,
        isPremium: blockId !== null && PREMIUM_SECTIONS.has(num),
        hasResonatesFeedback: !NO_FEEDBACK_SECTIONS.has(num),
      });
    }
    console.log(`  Found ${sections.length} sections`);
  } else {
    console.log(
      "  General template not found — skipping data/report-general.ts (archetype files still processed)"
    );
  }

  // 2. Parse archetype-specific files
  console.log("\nReading archetype-specific files...");
  const archetypeContent = {};

  for (const [blockId, filename] of Object.entries(BLOCK_FILE_MAP)) {
    const filePath = path.join(ROOT, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`  WARNING: Missing file: ${filename}`);
      continue;
    }

    const result = await mammoth.convertToHtml({ path: filePath });
    const byArchetype = splitByArchetype(result.value);
    archetypeContent[blockId] = byArchetype;

    const count = Object.keys(byArchetype).length;
    console.log(`  ${filename}: ${count}/14 archetypes`);
    if (count < 14) {
      const missing = ARCHETYPES.filter((a) => !byArchetype[a]);
      console.warn(`    Missing: ${missing.join(", ")}`);
    }
  }

  // 3. Write data/report-general.ts (only if template was present)
  if (templateExists) {
    // Append the manually maintained "Summary" section — its content lives in
    // data/report-summary.ts (generated by scripts/convert-summary-docx.js) and
    // is rendered separately by the report UI.
    if (!sections.some((s) => s.id === "summary")) {
      sections.push({
        id: "summary",
        sectionNumber: 35,
        title: "Summary",
        generalContent: "",
        archetypeBlockId: null,
        isPremium: true,
        hasResonatesFeedback: true,
      });
    }

    console.log("\nWriting data/report-general.ts...");
    const generalTs = `// Auto-generated from report .docx files — do not edit manually.
// Run: node scripts/convert-report-content.js

export interface ReportSection {
  /** Stable slug ID, e.g. "welcome", "core_archetype" */
  id: string;
  /** 1-32, or 35 for the manually appended Summary section */
  sectionNumber: number;
  /** Display heading */
  title: string;
  /** HTML string of the general/educational content */
  generalContent: string;
  /** Maps to archetype-specific content in report-archetypes.ts */
  archetypeBlockId: string | null;
  /** Whether premium overlay shows over archetype content */
  isPremium: boolean;
  /** Whether "Does this resonate?" feedback widget shows */
  hasResonatesFeedback: boolean;
}

export const reportSections: ReportSection[] = ${JSON.stringify(sections, null, 2)};
`;
    fs.writeFileSync(path.join(DATA_DIR, "report-general.ts"), generalTs, "utf-8");
  }

  // 4. Write data/report-archetypes.ts
  console.log("Writing data/report-archetypes.ts...");
  const archetypeTs = `// Auto-generated from report .docx files — do not edit manually.
// Run: node scripts/convert-report-content.js

/**
 * Archetype-specific report content.
 * Keys: archetypeBlockId → archetypeName → HTML content string.
 */
export const archetypeContent: Record<string, Record<string, string>> = ${JSON.stringify(archetypeContent, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, "report-archetypes.ts"), archetypeTs, "utf-8");

  console.log("\nDone! Generated:");
  console.log(`  data/report-general.ts   (${sections.length} sections)`);
  console.log(`  data/report-archetypes.ts (${Object.keys(archetypeContent).length} blocks)`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}

module.exports = {
  cleanHtml,
  splitByArchetype,
  splitSequentialH1Blocks,
  findNearestOpenTag,
};
