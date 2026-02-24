const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

// ─── Paths ─────────────────────────────────────────────────────────────────────
const csvPath = path.join(__dirname, "..", "data", "glossary-source.csv");
const tsPath = path.join(__dirname, "..", "data", "glossary-data.ts");

// ─── Slug generator (same logic as existing scripts) ───────────────────────────
function generateSlug(term) {
  return term
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Category determination (same logic as process-framework-glossary.js) ──────
function determineCategory(type, domain, sensitivityLevel) {
  if (type === "Pattern & Dynamic") return "pattern";
  if (type === "Framework & Model") return "frameworks";

  const frameworkTypes = [
    "Practice & Skill",
    "Data & Research Method",
    "Product Artifact",
    "Metric & Measurement",
  ];
  if (frameworkTypes.includes(type)) return "frameworks";

  if (
    type === "Trait & Disposition" ||
    type === "State & Experience" ||
    type === "Identity & Attraction" ||
    type === "Identity & Orientation"
  ) {
    if (domain === "Desire & Arousal" || domain === "Identity & Attraction") return "desire";
    if (domain === "Fantasy, Kink & Exploration" && sensitivityLevel === "Highly Sensitive")
      return "sensitive";
    return "pattern";
  }

  if (type === "Signal & Cue") {
    if (domain === "Desire & Arousal") return "desire";
    if (domain === "Fantasy, Kink & Exploration" && sensitivityLevel === "Highly Sensitive")
      return "sensitive";
  }

  if (type === "Need & Preference" || type === "Expectation & Norm") {
    if (domain === "Desire & Arousal") return "desire";
  }

  if (domain === "Fantasy, Kink & Exploration" && sensitivityLevel === "Highly Sensitive")
    return "sensitive";
  if (domain === "Consent & Boundaries") {
    return sensitivityLevel === "Highly Sensitive" ? "sensitive" : "frameworks";
  }
  if (domain === "Desire & Arousal") return "desire";

  return "frameworks";
}

// ─── Parse semicolon-separated values ──────────────────────────────────────────
function parseSemicolonList(value) {
  if (!value || value.trim() === "") return [];
  return value
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

// ─── Extract existing terms from the TS file ───────────────────────────────────
function extractExistingTerms(tsContent) {
  // Find the array content between the opening [ and closing ];
  const arrayStartMatch = tsContent.match(
    /export\s+const\s+glossaryTerms\s*:\s*GlossaryTerm\[\]\s*=\s*\[/
  );
  if (!arrayStartMatch) {
    console.error("Could not find glossaryTerms array in TS file");
    return new Map();
  }

  const arrayStart = arrayStartMatch.index + arrayStartMatch[0].length;

  // Find matching close bracket - track nesting
  let depth = 1;
  let pos = arrayStart;
  while (pos < tsContent.length && depth > 0) {
    if (tsContent[pos] === "[") depth++;
    else if (tsContent[pos] === "]") depth--;
    pos++;
  }
  const arrayEnd = pos - 1;
  const arrayContent = tsContent.substring(arrayStart, arrayEnd);

  // Parse each object in the array using JSON.parse on individual objects
  const terms = new Map();

  // Find each top-level object { ... }
  let objStart = -1;
  let objDepth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < arrayContent.length; i++) {
    const ch = arrayContent[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escapeNext = true;
      continue;
    }

    if (ch === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") {
      if (objDepth === 0) objStart = i;
      objDepth++;
    } else if (ch === "}") {
      objDepth--;
      if (objDepth === 0 && objStart >= 0) {
        const objStr = arrayContent.substring(objStart, i + 1);
        try {
          const obj = JSON.parse(objStr);
          terms.set(obj.id, obj);
        } catch (e) {
          console.error(`Failed to parse object near position ${objStart}: ${e.message}`);
          console.error("Object string (first 200 chars):", objStr.substring(0, 200));
        }
        objStart = -1;
      }
    }
  }

  return terms;
}

// ─── Compare two values for changes ────────────────────────────────────────────
function valuesEqual(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }
  return a === b;
}

// ─── Format a JS value for TS output ───────────────────────────────────────────
function formatValue(value, indent = "    ") {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => JSON.stringify(v));
    const singleLine = `[${items.join(",")}]`;
    // Use single line if reasonably short
    if (singleLine.length < 120) return singleLine;
    return "[\n" + items.map((v) => indent + "  " + v).join(",\n") + "\n" + indent + "]";
  }
  return JSON.stringify(value);
}

// ─── Main ──────────────────────────────────────────────────────────────────────
function main() {
  // 1. Read CSV
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  });

  console.log(`CSV: Parsed ${records.length} records`);

  // 2. Read existing TS
  const tsContent = fs.readFileSync(tsPath, "utf-8");
  const existingTerms = extractExistingTerms(tsContent);
  console.log(`TS:  Parsed ${existingTerms.size} existing terms\n`);

  // 3. Build CSV terms map
  const csvTerms = new Map();
  for (const row of records) {
    const id = parseInt(row["ID"], 10);
    if (isNaN(id)) {
      console.warn(`Skipping row with invalid ID: ${row["ID"]}`);
      continue;
    }

    const term = row["Term"] || "";
    const type = row["Type"] || "";
    const domain = row["Domain"] || "";
    const sensitivityLevel = row["Sensitivity Level"] || "";

    // Use existing slug/category if available, otherwise generate
    const existing = existingTerms.get(id);
    const slug = existing ? existing.slug : generateSlug(term);
    const category = existing
      ? existing.category
      : determineCategory(type, domain, sensitivityLevel);

    const csvTerm = {
      id,
      term,
      slug,
      type,
      category,
      definition: row["Definition"] || "",
      extendedNotes: row["Extended Notes"] || "",
      examples: parseSemicolonList(row["Examples"]),
      domain,
      sensitivityLevel,
      misinterpretations: parseSemicolonList(row["Misinterpretations"]),
      reality: parseSemicolonList(row["Reality_better_for_seo_geo"]),
      relatedTerms: parseSemicolonList(row["Related Terms"]),
      tags: parseSemicolonList(row["Tags"]),
    };

    csvTerms.set(id, csvTerm);
  }

  // 4. Compare and report differences
  const changes = [];
  const fieldsToCompare = [
    "term",
    "type",
    "definition",
    "extendedNotes",
    "examples",
    "domain",
    "sensitivityLevel",
    "misinterpretations",
    "reality",
    "relatedTerms",
    "tags",
  ];

  // Check for modified / updated terms
  for (const [id, csvTerm] of csvTerms) {
    const existing = existingTerms.get(id);
    if (!existing) {
      changes.push({ type: "ADDED", id, term: csvTerm.term });
      continue;
    }

    const fieldChanges = [];
    for (const field of fieldsToCompare) {
      if (!valuesEqual(csvTerm[field], existing[field])) {
        fieldChanges.push(field);
      }
    }

    if (fieldChanges.length > 0) {
      changes.push({ type: "MODIFIED", id, term: csvTerm.term, fields: fieldChanges });
    }
  }

  // Check for removed terms
  for (const [id, existing] of existingTerms) {
    if (!csvTerms.has(id)) {
      changes.push({ type: "REMOVED", id, term: existing.term });
    }
  }

  // 5. Print change report
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  CHANGE REPORT");
  console.log("═══════════════════════════════════════════════════════════════");

  const added = changes.filter((c) => c.type === "ADDED");
  const modified = changes.filter((c) => c.type === "MODIFIED");
  const removed = changes.filter((c) => c.type === "REMOVED");
  const unchanged = csvTerms.size - added.length - modified.length;

  console.log(`\n  Summary:`);
  console.log(`    Added:     ${added.length}`);
  console.log(`    Modified:  ${modified.length}`);
  console.log(`    Removed:   ${removed.length}`);
  console.log(`    Unchanged: ${unchanged}`);
  console.log(`    Total CSV: ${csvTerms.size}`);
  console.log(`    Total TS:  ${existingTerms.size}\n`);

  if (added.length > 0) {
    console.log("  ── ADDED TERMS ──");
    for (const c of added) {
      console.log(`    [+] ID ${c.id}: "${c.term}"`);
    }
    console.log("");
  }

  if (removed.length > 0) {
    console.log("  ── REMOVED TERMS ──");
    for (const c of removed) {
      console.log(`    [-] ID ${c.id}: "${c.term}"`);
    }
    console.log("");
  }

  if (modified.length > 0) {
    console.log("  ── MODIFIED TERMS ──");
    for (const c of modified) {
      console.log(`    [~] ID ${c.id}: "${c.term}"`);
      console.log(`        Changed fields: ${c.fields.join(", ")}`);

      // Show detail for each changed field
      for (const field of c.fields) {
        const oldVal = existingTerms.get(c.id)[field];
        const newVal = csvTerms.get(c.id)[field];

        if (Array.isArray(oldVal) && Array.isArray(newVal)) {
          const addedItems = newVal.filter((v) => !oldVal.includes(v));
          const removedItems = oldVal.filter((v) => !newVal.includes(v));
          if (addedItems.length > 0 || removedItems.length > 0) {
            console.log(`        ${field}:`);
            if (removedItems.length > 0) {
              console.log(`          removed: ${removedItems.length} item(s)`);
            }
            if (addedItems.length > 0) {
              console.log(`          added:   ${addedItems.length} item(s)`);
            }
          } else {
            // Same items but different order
            console.log(`        ${field}: reordered (${newVal.length} items)`);
          }
        } else if (typeof oldVal === "string" && typeof newVal === "string") {
          // Show a short preview of string changes
          const maxLen = 80;
          const oldPreview = oldVal.length > maxLen ? oldVal.substring(0, maxLen) + "..." : oldVal;
          const newPreview = newVal.length > maxLen ? newVal.substring(0, maxLen) + "..." : newVal;
          if (oldPreview !== newPreview) {
            console.log(`        ${field}:`);
            console.log(`          old: "${oldPreview}"`);
            console.log(`          new: "${newPreview}"`);
          }
        }
      }
      console.log("");
    }
  }

  console.log("═══════════════════════════════════════════════════════════════\n");

  // 6. Generate updated TS file
  // Sort by ID
  const allTerms = Array.from(csvTerms.values()).sort((a, b) => a.id - b.id);

  let output = `// Auto-generated from data/glossary-source.csv
// Do not edit manually

export interface GlossaryTerm {
  id: number;
  term: string;
  slug: string;
  type: string;
  category: string;
  definition: string;
  extendedNotes: string;
  examples: string[];
  domain: string;
  sensitivityLevel: string;
  misinterpretations: string[];
  reality: string[];
  relatedTerms: string[];
  tags: string[];
}

export const glossaryTerms: GlossaryTerm[] = [\n`;

  for (let i = 0; i < allTerms.length; i++) {
    const t = allTerms[i];
    const comma = i < allTerms.length - 1 ? "," : "";

    output += `  {\n`;
    output += `    "id": ${t.id},\n`;
    output += `    "term": ${JSON.stringify(t.term)},\n`;
    output += `    "slug": ${JSON.stringify(t.slug)},\n`;
    output += `    "type": ${JSON.stringify(t.type)},\n`;
    output += `    "category": ${JSON.stringify(t.category)},\n`;
    output += `    "definition": ${JSON.stringify(t.definition)},\n`;
    output += `    "extendedNotes": ${JSON.stringify(t.extendedNotes)},\n`;
    output += `    "examples": ${formatValue(t.examples)},\n`;
    output += `    "domain": ${JSON.stringify(t.domain)},\n`;
    output += `    "sensitivityLevel": ${JSON.stringify(t.sensitivityLevel)},\n`;
    output += `    "misinterpretations": ${formatValue(t.misinterpretations)},\n`;
    output += `    "reality": ${formatValue(t.reality)},\n`;
    output += `    "relatedTerms": ${formatValue(t.relatedTerms)},\n`;
    output += `    "tags": ${formatValue(t.tags)}\n`;
    output += `  }${comma}\n`;
  }

  output += `];

// Helper function to get a term by its slug
export function getTermBySlug(slug: string): GlossaryTerm | undefined {
  return glossaryTerms.find((term) => term.slug === slug);
}

// Helper function to get all slugs for static generation
export function getAllSlugs(): string[] {
  return glossaryTerms.map((term) => term.slug);
}
`;

  // 7. Write the updated TS file
  fs.writeFileSync(tsPath, output, "utf-8");
  console.log(`Updated ${tsPath}`);
  console.log(`Written ${allTerms.length} terms to glossary-data.ts`);
}

main();
