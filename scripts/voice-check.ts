/**
 * Check a draft chapter against the shipped copy for that chapter.
 *
 *   npm run voice:check -- <chapter> <file>
 *   npm run voice:check -- <chapter> drive/doc:1AbC...     # a draft already in the corpus
 *   npm run voice:check -- --chapters                       # what the shipped copy does
 *
 * Exit 0 clean, 1 on an error-level finding, 3 when the draft could not be read —
 * inconclusive is not success.
 */
import { readFileSync } from "node:fs";
import {
  allChapters,
  chapterBaseline,
  checkDraft,
  registerOutliers,
} from "@features/brain/server/voice";
import { supabaseFetch } from "@features/admin/server/supabase";

async function readDraft(where: string): Promise<string | null> {
  if (!where.includes("/") || where.startsWith(".") || where.startsWith("/")) {
    try {
      return readFileSync(where, "utf8");
    } catch {
      return null;
    }
  }
  // A corpus id: read every part back in order, so a long draft is checked whole.
  const [source, ...rest] = where.split("/");
  const base = rest.join("/");
  const res = await supabaseFetch(
    `/rest/v1/brain_chunk?select=source_id,body&source=eq.${encodeURIComponent(source!)}` +
      `&source_id=like.${encodeURIComponent(base)}*&order=source_id`
  );
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => [])) as Array<{ body?: string }>;
  return rows.length ? rows.map((r) => r.body ?? "").join("\n") : null;
}

function printChapters(): void {
  console.log(
    "chapter".padEnd(22) + "register".padEnd(9) + "versions".padEnd(10) + "median  skeleton"
  );
  for (const c of allChapters()) {
    const b = chapterBaseline(c);
    if (!b) continue;
    console.log(
      c.padEnd(22) +
        b.register.padEnd(9) +
        `${b.secondPersonVersions}/${b.archetypes}`.padEnd(10) +
        String(b.medianSentenceWords).padEnd(8) +
        (b.headingSequence ? `${b.headingSequence.length} headings` : "—")
    );
  }
  console.log(
    "\n`mixed` means the SHIPPED copy is inconsistent, so a draft has no baseline to be " +
      "checked against. That is worth fixing in the shipped copy first."
  );
}

async function main() {
  const [a, b] = process.argv.slice(2);
  if (a === "--outliers") {
    const found = registerOutliers();
    for (const o of found) {
      console.log(
        `${o.chapter}: ${o.archetypes.length} of ${o.total} break the chapter's ${o.majority}-person register`
      );
      for (const arch of o.archetypes) {
        console.log(`    ${arch}`);
        // The sentence, not just the block: this is the difference between a finding and
        // an edit somebody can make in a minute.
        for (const sentence of o.offendingSentences[arch] ?? [])
          console.log(
            `        "${sentence.length > 150 ? sentence.slice(0, 150) + "…" : sentence}"`
          );
        if ((o.offendingSentences[arch] ?? []).length === 0 && o.majority === "second")
          console.log(`        (no second person anywhere — the whole block is third person)`);
      }
    }
    console.log(
      found.length === 0
        ? "\n=== every chapter is internally consistent ==="
        : `\n=== ${found.reduce((t, o) => t + o.archetypes.length, 0)} block(s) to reconcile ===`
    );
    process.exit(0);
  }
  if (!a || a === "--chapters") {
    printChapters();
    process.exit(0);
  }
  if (!b) {
    console.error("Usage: npm run voice:check -- <chapter> <file|corpus-id>");
    process.exit(3);
  }
  const draft = await readDraft(b);
  if (draft === null) {
    console.error(`Could not read "${b}" as a file or a corpus id. Nothing was checked.`);
    process.exit(3);
  }

  const base = chapterBaseline(a);
  if (base) {
    console.log(
      `Checking against the shipped "${a}": ${base.register} person in ` +
        `${base.secondPersonVersions}/${base.archetypes} versions, median ${base.medianSentenceWords} words.\n`
    );
  }
  const findings = checkDraft(a, draft);
  for (const f of findings) {
    console.log(`${f.severity.toUpperCase()} [${f.kind}] ${f.message}`);
    for (const e of f.evidence ?? []) console.log(`    "${e.slice(0, 140)}"`);
    console.log();
  }
  const errors = findings.filter((f) => f.severity === "error").length;
  console.log(
    findings.length === 0
      ? "=== reads like the shipped chapter ==="
      : `=== ${errors} error(s), ${findings.length - errors} warning(s) ===`
  );
  process.exit(errors ? 1 : 0);
}

main().catch((e) => {
  console.error("voice check failed to run:", e instanceof Error ? e.message : e);
  process.exit(3);
});
