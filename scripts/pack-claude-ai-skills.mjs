#!/usr/bin/env node
/**
 * Builds one zip per claude.ai skill in docs/claude-ai-skills/, for Settings → Capabilities
 * → Skills → Upload skill.
 *
 *   npm run skills:pack          # writes dist/claude-ai-skills/<name>.zip
 *
 * It refuses a skill claude.ai would refuse: front matter keys outside the Agent Skills
 * set (upload fails with "Unexpected key(s) in SKILL.md frontmatter"), a name that is not
 * lowercase words and hyphens matching its folder, or a description over 1,024 characters.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export const ALLOWED_KEYS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

/** Top-level front matter keys and their one-line values. Enough for SKILL.md files. */
export function frontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

/** Why claude.ai would refuse this skill, or [] when it would accept it. */
export function skillProblems(dir, text) {
  const fm = frontMatter(text);
  if (!fm) return ["SKILL.md has no front matter"];
  const problems = [];
  for (const key of Object.keys(fm)) {
    if (!ALLOWED_KEYS.has(key)) problems.push(`front matter key "${key}" is not allowed`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fm.name ?? "") || (fm.name ?? "").length > 64) {
    problems.push(`name "${fm.name ?? ""}" must be lowercase words and hyphens, 64 at most`);
  }
  if (fm.name !== dir) problems.push(`name "${fm.name}" does not match its folder "${dir}"`);
  if (!fm.description) problems.push("description is missing");
  else if (fm.description.length > 1024) {
    problems.push(`description is ${fm.description.length} characters, over 1,024`);
  }
  return problems;
}

export const SKILLS_DIR = resolve(HERE, "..", "docs", "claude-ai-skills");

export function skillDirs() {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(SKILLS_DIR, d.name, "SKILL.md")))
    .map((d) => d.name)
    .sort();
}

if (process.argv[1]?.endsWith("pack-claude-ai-skills.mjs")) {
  const out = resolve(HERE, "..", "dist", "claude-ai-skills");
  let failed = false;
  for (const dir of skillDirs()) {
    const problems = skillProblems(dir, readFileSync(join(SKILLS_DIR, dir, "SKILL.md"), "utf8"));
    if (problems.length) {
      failed = true;
      console.error(`${dir}: ${problems.join("; ")}`);
    }
  }
  if (failed) process.exit(1);
  mkdirSync(out, { recursive: true });
  for (const dir of skillDirs()) {
    const zip = join(out, `${dir}.zip`);
    rmSync(zip, { force: true });
    // The zip holds the folder, so SKILL.md sits at <name>/SKILL.md as the upload expects.
    execFileSync("zip", ["-rq", zip, dir], { cwd: SKILLS_DIR });
    console.log(`wrote ${zip}`);
  }
}
