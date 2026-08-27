#!/usr/bin/env node

/**
 * Ingest the repo's own knowledge into the company-brain corpus: every tracked
 * markdown doc, chunked on headings, plus every commit message.
 *
 * WHY THIS RUNS IN A GITHUB ACTION AND NOT A VERCEL CRON. Both inputs live in
 * git: the docs are files and the commits are history. In an Action both are
 * simply present on disk. From a Vercel function neither is -- Next.js only
 * bundles what is imported, so reading arbitrary `.md` at runtime means fighting
 * `outputFileTracingIncludes`, and `git log` is not there at all. Docs and
 * commits also only change on push, so ingest-on-push is both simpler and
 * fresher than a nightly crawl.
 *
 * WHY COMMITS ARE WORTH INDEXING AT ALL. This repo's convention puts a
 * plain-English `For Marcus:` line at the end of every commit message, written
 * for a non-technical reader. That makes the commit log the single best corpus
 * here for "what changed and why" questions from someone who does not read code
 * -- which is most of who this brain is for. Those lines are lifted into
 * `meta.for_marcus` so the answer layer can prefer them.
 *
 * IDEMPOTENT. Upserts on the natural key (source, source_id), then sweeps any row
 * of that source it did not touch this run -- that is how a deleted file or a
 * renamed heading stops being retrievable.
 *
 * COMMITS ARE SWEPT TOO, which they did not used to be. "Append-only" held only
 * while chunking never changed: the moment a commit's body is re-chunked into
 * fewer parts (stripping machine trailers did exactly that), the leftover
 * `<sha>-2` rows become permanently unreachable orphans that can still be
 * retrieved and cited. Both sweeps are guarded by the write count OF THEIR OWN
 * SOURCE, never the total.
 *
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/brain-ingest-repo.mjs [--dry-run]
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";

const REPO = "loveiqhq/loveiq";
const DRY_RUN = process.argv.includes("--dry-run");

// Vendored third-party agent skills (~700 KB of prose that is not LoveIQ
// knowledge) and per-tool assistant config. Same exclusion list the docs-truth
// checker uses, for the same reason.
const EXCLUDED_PREFIXES = [
  ".agents/",
  ".claude/",
  ".codeium/",
  // CLAUDE.md's own Agent Operating Rule 11 says planning docs must be DELETED
  // once the task is done, so indexing them means the brain cites, with the same
  // weight as CLAUDE.md, exactly the files the project treats as disposable. A
  // plan is a statement of intent on a date, not a fact — and measured,
  // `docs/plans/2026-04-10-report-archetype-svg-design.md#scope` placed rank 3 on
  // four unrelated questions.
  "docs/plans/",
  ".source-artifacts/",
];

// Chunk sizing. TARGET is what the packer aims for; HARD_MAX is the ceiling no
// row may exceed. Both matter for different reasons:
//   * Too large destroys retrieval precision (the whole 78 KB CLAUDE.md would
//     match every query) and eats the LLM context budget.
//   * Too small fragments an argument across rows, so the chunk that ranks first
//     no longer contains the answer.
// Measured on this repo, heading-splitting ALONE produced a median of 326 chars
// with a 44,405-char outlier -- a markdown table with no blank lines inside it,
// which is why splitting on paragraph breaks alone is not sufficient and
// HARD_MAX has to be enforced by slicing.
const TARGET_CHARS = 1500;
const HARD_MAX_CHARS = 2400;
// Below this a chunk is noise (a stray `---`, a one-word stub), so it is merged
// into its neighbour rather than stored as its own row.
const MIN_CHARS = 60;

// Upsert batch size. Keeps any single PostgREST request well inside limits and
// makes a partial failure cheap to repeat.
const BATCH = 200;

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

/** GitHub's heading anchor: lowercased, punctuation dropped, spaces to dashes. */
function anchor(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function slug(text) {
  return anchor(text).slice(0, 80) || "section";
}

/**
 * Slice text that exceeds HARD_MAX_CHARS, preferring a paragraph break, then a
 * line break, then a hard cut. The hard cut is the case that actually fires on
 * wide markdown tables, where neither break exists inside the limit.
 */
function hardSplit(text) {
  const out = [];
  let rest = text;
  while (rest.length > HARD_MAX_CHARS) {
    const window = rest.slice(0, HARD_MAX_CHARS);
    let cut = window.lastIndexOf("\n\n");
    if (cut < MIN_CHARS) cut = window.lastIndexOf("\n");
    if (cut < MIN_CHARS) cut = HARD_MAX_CHARS;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/**
 * Split a markdown document into retrievable chunks.
 *
 * Two passes, because one is not enough. First split on headings, keeping a
 * breadcrumb of the enclosing ones so a chunk still says where it came from.
 * Then GREEDILY PACK consecutive sections up to TARGET_CHARS -- without packing,
 * this repo's AGENT_README files yield dozens of 300-char fragments and the
 * chunk that ranks first rarely holds the whole answer.
 */
function chunkMarkdown(path, text) {
  const lines = text.split(/\r?\n/);
  const segments = [];
  const stack = [];
  let buf = [];
  let heading = null;

  const flushSegment = () => {
    const body = buf.join("\n").trim();
    buf = [];
    if (!body) return;
    segments.push({
      heading,
      crumb: stack.map((s) => s.text).join(" > "),
      anchorId: heading ? anchor(heading) : "",
      body,
    });
  };

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (m) {
      flushSegment();
      const depth = m[1].length;
      const text_ = m[2].replace(/\s*#+\s*$/, "");
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      stack.push({ depth, text: text_ });
      heading = text_;
      continue;
    }
    buf.push(line);
  }
  flushSegment();

  // Oversized segments are sliced before packing, so HARD_MAX_CHARS holds for
  // every row regardless of how the source was written.
  const sized = [];
  for (const seg of segments) {
    for (const piece of hardSplit(seg.body)) sized.push({ ...seg, body: piece });
  }

  // Greedy pack. A chunk keeps the breadcrumb of its first segment, which is the
  // most specific heading a reader would look under.
  const packed = [];
  for (const seg of sized) {
    const last = packed[packed.length - 1];
    if (
      last &&
      last.body.length + seg.body.length + 2 <= TARGET_CHARS &&
      last.body.length < TARGET_CHARS
    ) {
      last.body += `\n\n${seg.body}`;
      if (seg.heading && !last.covered.includes(seg.heading)) last.covered.push(seg.heading);
      continue;
    }
    packed.push({ ...seg, covered: seg.heading ? [seg.heading] : [] });
  }

  // A trailing scrap shorter than MIN_CHARS is folded back rather than stored.
  for (let i = packed.length - 1; i > 0; i--) {
    if (packed[i].body.length < MIN_CHARS) {
      packed[i - 1].body += `\n\n${packed[i].body}`;
      packed.splice(i, 1);
    }
  }

  const docName = path.split("/").pop();

  /**
   * Title fed to retrieval. Built as filename + heading breadcrumb, with
   * consecutive repeats collapsed -- a doc whose H1 matches its filename
   * otherwise yields "CLAUDE.md > CLAUDE.md > Environment Variables", and that
   * redundancy dilutes the `word_similarity` term the ranker weights 2x.
   */
  const buildTitle = (crumb) => {
    const parts = [docName, ...(crumb ? crumb.split(" > ") : [])];
    const norm = (t) =>
      t
        .toLowerCase()
        .replace(/\.mdx?$/, "")
        .trim();
    return parts.filter((part, i) => i === 0 || norm(part) !== norm(parts[i - 1])).join(" > ");
  };

  const seen = new Map();
  return packed
    .filter((c) => c.body.length >= MIN_CHARS || packed.length === 1)
    .map((c) => {
      const base = `${path}#${slug(c.heading ?? "intro")}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return {
        source: "doc",
        source_id: n === 1 ? base : `${base}-${n}`,
        title: buildTitle(c.crumb),
        url: `https://github.com/${REPO}/blob/main/${path}${c.anchorId ? `#${c.anchorId}` : ""}`,
        body: c.body,
        // A doc describes no period; null sorts last on the recency tie-break.
        period_end: null,
        meta: { path, heading: c.heading, part: n, covers: c.covered.slice(0, 12) },
      };
    });
}

function collectDocs() {
  const files = git(["ls-files", "*.md"])
    .split("\n")
    .filter(Boolean)
    .filter((f) => !EXCLUDED_PREFIXES.some((p) => f.startsWith(p)));

  const rows = [];
  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f, "utf8");
    } catch {
      continue; // listed in the index but absent from the worktree
    }
    rows.push(...chunkMarkdown(f, text));
  }
  return { rows, fileCount: files.length };
}

/**
 * Drop machine trailers from a commit body before it is indexed.
 *
 * 532 of 1,516 commit chunks carried `Co-Authored-By:` lines, and one chunk's
 * entire body was a single 68-character trailer — a zero-information row that can
 * still be retrieved and rendered to the reader as a numbered source. Worse, this
 * repo's commit convention forbids AI attribution precisely because the Slack
 * commit channel must read as the team's own work, and the brain answers into
 * Slack: without this it can quote those trailers straight back.
 */
function stripTrailers(body) {
  return (body ?? "")
    .split("\n")
    .filter(
      (line) =>
        !/^\s*(co-authored-by|signed-off-by|generated[- ]with|reviewed-by|helped-by)\s*:/i.test(
          line
        )
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectCommits() {
  // Unit/record separators so a commit body containing newlines, pipes or tabs
  // cannot break the parse.
  const raw = git(["log", "--no-merges", "--pretty=format:%H%x1f%an%x1f%aI%x1f%s%x1f%b%x1e"]);
  const rows = [];
  for (const rec of raw.split("\x1e")) {
    const t = rec.replace(/^\n/, "");
    if (!t.trim()) continue;
    const [sha, author, date, subject, rawBody = ""] = t.split("\x1f");
    if (!sha || !subject) continue;
    const body = stripTrailers(rawBody);
    const message = body.trim() ? `${subject}\n\n${body.trim()}` : subject;

    // A commit whose entire message is one word — "fix", "update", "test" — cannot
    // answer anything, but it CAN win a retrieval slot (`word_similarity` scores a
    // 3-character body highly against a short query) and is then rendered to the
    // reader as a numbered source.
    //
    // 8 is deliberately the low end. Measured on this history: <8 drops 71 commits
    // and every one is a single word; <15 would drop 201, taking real messages
    // like "fix lint" with it. The point is to remove chunks with no information,
    // not to curate.
    if (message.trim().length < 8) continue;

    // This repo's commit convention puts a plain-English summary for a
    // non-technical reader at the END of the message. Lifting it into meta means
    // it survives on EVERY part of a split commit, and gives the answer layer a
    // ready-made non-technical phrasing to prefer.
    // Greedy, not lazy: these summaries wrap over several lines, and a lazy
    // match with the `m` flag stops at the first line end -- measured, it kept
    // 69 of 251 chars on a real commit.
    const forMarcus = /^For Marcus:\s*([\s\S]+)$/im.exec(body ?? "")?.[1]?.trim() ?? null;

    // Commit messages here are long-form -- 66 of them exceeded the 2400-char
    // ceiling, the worst at 6412. They get the same slicing as docs rather than
    // truncation, because truncating from the end would drop exactly the
    // `For Marcus:` line that makes a commit legible to the people this brain is
    // for. Every part keeps the subject as its title, so a matching part still
    // says which commit it came from.
    const parts = hardSplit(message);
    parts.forEach((part, i) => {
      rows.push({
        source: "commit",
        source_id: i === 0 ? sha : `${sha}-${i + 1}`,
        title: subject,
        url: `https://github.com/${REPO}/commit/${sha}`,
        body: part,
        // The commit's own date, so recency ties break on when the work happened
        // rather than on when we last ingested — `updated_at` is stamped once per
        // run and cannot order anything.
        // UTC, not the author's local date. `%aI` carries an offset, so slicing
        // the first 10 characters gave the committer's local day — 162 of 1510
        // commits landed one day later than their UTC instant, and since
        // brain_search tie-breaks on period_end, a late-night European commit
        // outranked chunks genuinely dated the same real day. Every other source
        // uses UTC dates.
        period_end: typeof date === "string" ? new Date(date).toISOString().slice(0, 10) : null,
        meta: {
          sha: sha.slice(0, 8),
          author,
          date,
          for_marcus: forMarcus,
          ...(parts.length > 1 ? { part: i + 1, parts: parts.length } : {}),
        },
      });
    });
  }
  return rows;
}

async function upsert(rows, stampedAt) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({ ...r, updated_at: stampedAt }));
    const res = await fetch(`${url}/rest/v1/brain_chunk?on_conflict=source,source_id`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      console.error(`upsert failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
      process.exit(1);
    }
    written += batch.length;
    process.stdout.write(`\r  upserted ${written}/${rows.length}`);
  }
  process.stdout.write("\n");
  return written;
}

/** Remove `doc` rows this run did not touch: deleted files, renamed headings. */
async function sweepStaleSource(source, stampedAt) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(
    `${url}/rest/v1/brain_chunk?source=eq.${encodeURIComponent(source)}&updated_at=lt.${encodeURIComponent(stampedAt)}`,
    {
      method: "DELETE",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=representation",
      },
    }
  );
  if (!res.ok) {
    console.error(`sweep failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const deleted = await res.json().catch(() => []);
  return Array.isArray(deleted) ? deleted.length : 0;
}

// RUN FROM THE REPO ROOT, ALWAYS. `git ls-files "*.md"` is CWD-SCOPED and
// `readFileSync` resolves cwd-relative, so invoking this from a subdirectory
// collects a SUBSET of the docs — 39 files from `docs/` against 218 from the root —
// which then satisfies the `docRows.length > 0` sweep guard and deletes every doc
// chunk outside that subdirectory, CLAUDE.md and FILE_INDEX.md included. One line
// removes the entire class rather than guarding against it.
process.chdir(git(["rev-parse", "--show-toplevel"]).trim());

// COMMITS ARE NEVER SWEPT (see the note at the top of this file), and every commit
// chunk carries a `github.com/.../commit/<sha>` permalink. Ingesting from a
// feature branch therefore injects PERMANENT rows whose links die the moment the
// branch is squash-merged or deleted. The GitHub Action only runs on `main`; this
// guard is for a manual run, where the mistake is easy and irreversible.
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
const onMain = branch === "main" || process.argv.includes("--allow-branch");
if (!onMain && !process.argv.includes("--dump-json") && !process.argv.includes("--dry-run")) {
  console.error(
    `refusing to ingest commits from branch "${branch}": their permalinks would die on merge.\n` +
      `Run from main, or pass --allow-branch if you accept that.`
  );
  process.exit(1);
}

const { rows: docRows, fileCount } = collectDocs();
const commitRows = collectCommits();
const withMarcus = commitRows.filter((r) => r.meta.for_marcus).length;

if (process.argv.includes("--dump-json")) {
  // Machine-readable dump for the audit harness, and for diffing what a future
  // change to the chunker actually alters.
  process.stdout.write(JSON.stringify([...docRows, ...commitRows]));
  process.exit(0);
}

console.log(`docs:    ${fileCount} files -> ${docRows.length} chunks`);
console.log(`commits: ${commitRows.length} (${withMarcus} with a "For Marcus:" summary)`);

if (DRY_RUN) {
  const sample = [...docRows.slice(0, 2), ...commitRows.slice(0, 2)];
  console.log("\n--dry-run, sample rows:");
  for (const r of sample) {
    console.log(`\n[${r.source}] ${r.source_id}`);
    console.log(`  title: ${r.title}`);
    console.log(`  url:   ${r.url}`);
    console.log(`  meta:  ${JSON.stringify(r.meta)}`);
    console.log(`  body:  ${r.body.slice(0, 160).replace(/\n/g, " ")}...`);
  }
  const sizes = docRows.map((r) => r.body.length).sort((a, b) => a - b);
  if (sizes.length) {
    console.log(
      `\ndoc chunk chars: min ${sizes[0]} / median ${sizes[Math.floor(sizes.length / 2)]} / max ${sizes[sizes.length - 1]}`
    );
  }
  process.exit(0);
}

// Stamped once, before any write, so the sweep below can only ever delete rows
// that predate this run -- never a row a later batch of this same run wrote.
const stampedAt = new Date().toISOString();
await upsert([...docRows, ...commitRows], stampedAt);

// GUARDED BY THE DOC COUNT, NOT THE TOTAL. This sweep deletes `source=eq.doc`,
// but the write it follows is dominated by ~1500 commit rows — so a total-row
// guard is always satisfied and proves nothing about docs. Run from a directory
// where the glob finds no markdown (or after a bad `collectDocs`), this deleted
// every doc chunk in the corpus — 471 rows, a quarter of it — and exited 0.
// A SHALLOW CLONE IS NOT A SMALLER HISTORY, IT IS A LIE ABOUT HISTORY.
// `git clone --depth 1` yields ONE commit, which produces ~3 chunks — enough to
// satisfy a `> 0` guard — and the sweep would then delete the other ~1,448,
// 99.8% of the largest source, and exit 0. The CI workflow sets `fetch-depth: 0`,
// but nothing stopped a manual run.
const isShallow = git(["rev-parse", "--is-shallow-repository"]).trim() === "true";

/**
 * Refuse to sweep when this run wrote far less than the source already holds.
 *
 * `wroteRows > 0` closes only the empty case, and the PARTIAL case is both more
 * likely and nearly as damaging: a truncated upstream, a sparse checkout, a failed
 * glob. Comparing against what is already stored turns "did we write anything"
 * into "did we write plausibly all of it".
 */
async function safeToSweep(source, wroteRows) {
  if (wroteRows <= 0) {
    console.warn(`no ${source} chunks collected — refusing to sweep ${source}`);
    return false;
  }
  if (isShallow) {
    console.warn(`shallow clone — refusing to sweep ${source} (history is incomplete)`);
    return false;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(
    `${url}/rest/v1/brain_chunk?select=id&source=eq.${encodeURIComponent(source)}`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: "0-0" },
    }
  );
  const existing = Number(res.headers.get("content-range")?.split("/")[1] ?? 0);
  // First ever run for this source: nothing to protect.
  if (!Number.isFinite(existing) || existing === 0) return true;
  const ratio = wroteRows / existing;
  if (ratio < 0.5) {
    console.warn(
      `refusing to sweep ${source}: this run wrote ${wroteRows} but ${existing} exist ` +
        `(${Math.round(ratio * 100)}%). That looks like a partial collection, not a deletion.`
    );
    return false;
  }
  return true;
}

const sweptDocs = (await safeToSweep("doc", docRows.length))
  ? await sweepStaleSource("doc", stampedAt)
  : 0;
const sweptCommits = (await safeToSweep("commit", commitRows.length))
  ? await sweepStaleSource("commit", stampedAt)
  : 0;
console.log(`swept ${sweptDocs} stale doc chunk(s), ${sweptCommits} stale commit chunk(s)`);
