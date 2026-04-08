/**
 * Regenerate data/report-archetypes.ts from chapter .docx files.
 *
 * This is a targeted variant of convert-report-content.js that ONLY
 * regenerates report-archetypes.ts, leaving report-general.ts untouched.
 *
 * Run:  node scripts/regenerate-archetypes.js
 */

const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

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
  "Exhibitionist Performer",
  "Explorer of Edges",
  "Curious Apprentice",
  "Spiritual Lover",
  "Minimalist Companion",
  "Emotional Voyeur",
  "Power Orchestrator",
  "Loyal Ritualist",
  "Approval Seeker",
  "Analytical Sexualist",
  "Quiet Withdrawer",
];

function cleanHtml(html) {
  return html
    .replace(/<a id="[^"]*"><\/a>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2028/g, " ")
    .trim();
}

function stripBlockMarkers(html) {
  return html
    .replace(/<p>\[\[ARCHETYPE_BLOCK_\w+\]\]<\/p>/g, "")
    .replace(/<p><em>Template notes[^<]*<\/em><\/p>/g, "")
    .trim();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitSequentialH1Blocks(rawHtml, orderedKeys) {
  const parts = rawHtml.split(/<h1>Core Archetype\s*<\/h1>/i).slice(1);
  const result = {};
  parts.forEach((part, index) => {
    const archetype = orderedKeys[index];
    if (!archetype) return;
    const content = cleanHtml(stripBlockMarkers(part));
    if (content) result[archetype] = content;
  });
  return result;
}

function splitByArchetype(rawHtml) {
  const result = {};
  const html = rawHtml.replace(/<a id="[^"]*"><\/a>/g, "");
  const markers = [];

  for (const archetype of ARCHETYPES) {
    const escaped = escapeRegex(archetype);
    const nameRegex = new RegExp(escaped, "g");
    let nameMatch;
    while ((nameMatch = nameRegex.exec(html)) !== null) {
      const pos = nameMatch.index;
      const preceding = html.substring(Math.max(0, pos - 300), pos);
      const lastOpenTag = preceding.match(/<(h[123]|p)[^>]*>[^]*$/);
      if (!lastOpenTag) continue;

      const tagName = lastOpenTag[1];
      const tagContent = lastOpenTag[0];

      if (tagName.startsWith("h")) {
        const tagStart = pos - tagContent.length;
        const closeTag = `</${tagName}>`;
        const closeIdx = html.indexOf(closeTag, pos);
        const headingEnd = closeIdx !== -1 ? closeIdx + closeTag.length : pos + archetype.length;
        markers.push({ archetype, headingStart: tagStart, headingEnd });
        break;
      }

      if (tagName === "p") {
        const closeIdx = html.indexOf("</p>", pos);
        if (closeIdx === -1) continue;
        const pContent = html.substring(pos - tagContent.length, closeIdx + 4);
        const plainP = pContent.replace(/<[^>]+>/g, "");
        const isTitle =
          plainP.length < 200 ||
          plainP.match(new RegExp(`^\\s*The\\s+${escaped}\\s`, "i")) ||
          plainP.match(new RegExp(`(?:of the|for the)\\s+${escaped}`, "i"));

        if (isTitle) {
          const tagStart = pos - tagContent.length;
          markers.push({ archetype, headingStart: tagStart, headingEnd: closeIdx + 4 });
          break;
        }
      }
    }
  }

  markers.sort((a, b) => a.headingStart - b.headingStart);

  for (let i = 0; i < markers.length; i++) {
    const startIdx = markers[i].headingEnd;
    const endIdx = i + 1 < markers.length ? markers[i + 1].headingStart : html.length;
    const content = cleanHtml(stripBlockMarkers(html.substring(startIdx, endIdx)));
    if (content) result[markers[i].archetype] = content;
  }

  return result;
}

async function main() {
  console.log("Regenerating data/report-archetypes.ts from chapter .docx files...\n");

  const archetypeContent = {};
  let totalMissing = 0;

  for (const [blockId, filename] of Object.entries(BLOCK_FILE_MAP)) {
    const filePath = path.join(ROOT, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`  WARNING: Missing file: ${filename}`);
      continue;
    }

    const result = await mammoth.convertToHtml({ path: filePath });
    const byArchetype =
      blockId === "core_archetype"
        ? splitSequentialH1Blocks(result.value, ARCHETYPES)
        : splitByArchetype(result.value);

    archetypeContent[blockId] = byArchetype;

    const count = Object.keys(byArchetype).length;
    const status = count === 14 ? "✓" : "✗";
    console.log(`  ${status} ${filename}: ${count}/14 archetypes`);
    if (count < 14) {
      const missing = ARCHETYPES.filter((a) => !byArchetype[a]);
      console.warn(`      Missing: ${missing.join(", ")}`);
      totalMissing += 14 - count;
    }
  }

  const archetypeTs = `// Auto-generated from report .docx files — do not edit manually.
// Run: node scripts/regenerate-archetypes.js

/**
 * Archetype-specific report content.
 * Keys: archetypeBlockId → archetypeName → HTML content string.
 */
export const archetypeContent: Record<string, Record<string, string>> = ${JSON.stringify(archetypeContent, null, 2)};
`;
  fs.writeFileSync(path.join(DATA_DIR, "report-archetypes.ts"), archetypeTs, "utf-8");

  console.log(`\nDone! Written data/report-archetypes.ts`);
  if (totalMissing > 0) {
    console.warn(
      `\n⚠ ${totalMissing} archetype block(s) could not be extracted — review warnings above.`
    );
  } else {
    console.log("All 336 archetype blocks extracted successfully.");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
