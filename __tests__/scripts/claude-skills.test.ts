/**
 * The Jarvis pack: the Claude Code skills and agents in .claude/, and the claude.ai skills in
 * docs/claude-ai-skills/. Each one is loaded only if its front matter is right, and each is
 * useful only while the Jarvis tools it names exist, and neither failure makes a sound: a
 * file Claude Code cannot read is treated as documentation, and a skill naming a renamed
 * tool just stops working. So both are checked here.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALLOWED_KEYS,
  frontMatter,
  skillDirs,
  skillProblems,
  SKILLS_DIR,
} from "@/scripts/pack-claude-ai-skills.mjs";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** Every Jarvis tool and prompt name, read from where they are defined. */
const JARVIS = new Set([
  ...[...read("app/api/mcp/route.ts").matchAll(/^ {4}name: "([a-z_]+)",$/gm)].map((m) => m[1]!),
  ...[...read("features/brain/server/prompts.ts").matchAll(/^ {4}name: "([a-z_]+)",$/gm)].map(
    (m) => m[1]!
  ),
]);

/**
 * Every source a search can name, from the list its schema enforces. Comments dropped first:
 * they quote other names ("per the rule below about `jira`").
 */
const SOURCES = new Set(
  [
    ...(
      /^export const SOURCES_FOR_TEST = \[\n([\s\S]*?)\n\];$/m.exec(
        read("app/api/mcp/route.ts")
      )?.[1] ?? ""
    )
      .replace(/\/\/.*$/gm, "")
      .matchAll(/"([a-z_]+)"/g),
  ].map((m) => m[1]!)
);

/** Quoted names inside a backticked list, as a skill writes `sources: ["paper"]` or `["book"]`. */
const namedSources = (text: string) =>
  [...text.matchAll(/`[^`\n]*\[((?:"[a-z_]+",?\s*)+)\][^`\n]*`/g)].flatMap((m) =>
    [...m[1]!.matchAll(/"([a-z_]+)"/g)].map((n) => n[1]!)
  );

/** `snake_case` names in backticks: how every skill writes a Jarvis tool. */
const namedTools = (text: string) =>
  [...text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((m) => m[1]!);

const claudeCodeSkills = readdirSync(resolve(ROOT, ".claude/skills"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((d) => {
    try {
      return !!read(`.claude/skills/${d}/SKILL.md`);
    } catch {
      return false;
    }
  });

describe("the tool names the pack relies on", () => {
  it("reads Jarvis's real tools and prompts, so the check below can fail", () => {
    expect(JARVIS.has("search_company_context")).toBe(true);
    expect(JARVIS.has("check_copy")).toBe(true);
    expect(JARVIS.has("catch_me_up")).toBe(true);
    expect(JARVIS.size).toBeGreaterThan(40);
  });

  const packFiles = [
    ...skillDirs().map((d) => [`claude.ai ${d}`, join(SKILLS_DIR, d, "SKILL.md")] as const),
    ...claudeCodeSkills.map((d) => [`Claude Code ${d}`, `.claude/skills/${d}/SKILL.md`] as const),
    ["the Project instructions", join(SKILLS_DIR, "PROJECT_INSTRUCTIONS.md")] as const,
  ];

  it.each(packFiles)("%s names only tools Jarvis has", (_, path) => {
    const unknown = namedTools(read(path)).filter((n) => !JARVIS.has(n));
    expect(unknown).toEqual([]);
  });

  it("reads the real source list, so the check below can fail", () => {
    expect(SOURCES.has("paper")).toBe(true);
    expect(SOURCES.has("book")).toBe(true);
    expect(SOURCES.has("corporate")).toBe(true);
    // A word a comment quotes is not a source: one says ga4 can only answer "where".
    expect(SOURCES.has("where")).toBe(false);
    expect(SOURCES.size).toBe(22);
    expect(namedSources('`sources: ["evidence"]`, then `["paper", "book"]`')).toEqual([
      "evidence",
      "paper",
      "book",
    ]);
  });

  it.each(packFiles)("%s searches only sources Jarvis has", (_, path) => {
    // A misspelt source is refused by the search schema, so the skill's step fails outright.
    const unknown = namedSources(read(path)).filter((n) => !SOURCES.has(n));
    expect(unknown).toEqual([]);
  });
});

describe("the claude.ai skills upload", () => {
  it("has the four skills, each one claude.ai would accept", () => {
    expect(skillDirs()).toEqual([
      "loveiq-chapter-writer",
      "loveiq-copy-gate",
      "loveiq-numbers",
      "loveiq-research",
    ]);
    for (const d of skillDirs()) {
      expect(skillProblems(d, readFileSync(join(SKILLS_DIR, d, "SKILL.md"), "utf8")), d).toEqual(
        []
      );
    }
  });

  it("refuses what claude.ai refuses: an unknown key, a bad or mismatched name, a long description", () => {
    const skill = (fm: string) => `---\n${fm}\n---\n\n# x\n`;
    expect(skillProblems("a-b", skill("name: a-b\ndescription: ok\nargument-hint: x"))).toEqual([
      'front matter key "argument-hint" is not allowed',
    ]);
    expect(skillProblems("a-b", skill("name: A_B\ndescription: ok"))).toContain(
      'name "A_B" must be lowercase words and hyphens, 64 at most'
    );
    expect(skillProblems("a-b", skill("name: c-d\ndescription: ok"))).toContain(
      'name "c-d" does not match its folder "a-b"'
    );
    expect(skillProblems("a-b", skill(`name: a-b\ndescription: ${"x".repeat(1025)}`))).toEqual([
      "description is 1025 characters, over 1,024",
    ]);
    expect(skillProblems("a-b", "# no front matter\n")).toEqual(["SKILL.md has no front matter"]);
    // YAML claude.ai cannot read, which a line-by-line match used to pass.
    expect(skillProblems("a-b", skill('name: a-b\ndescription: "unterminated'))[0]).toMatch(
      /^front matter is not valid YAML/
    );
    expect(skillProblems("a-b", skill("name: a-b\ndescription: use for: this"))[0]).toMatch(
      /^front matter is not valid YAML/
    );
    // A quoted value is the text inside the quotes, as YAML means it.
    expect(skillProblems("a-b", skill('name: "a-b"\ndescription: "fine"'))).toEqual([]);
    expect(skillProblems("a-b", skill("name: a-b\ndescription: [a list]"))).toContain(
      "description must be text"
    );
    // YAML reads 123 as a number, in a folder called "123" too.
    expect(skillProblems("123", skill("name: 123\ndescription: ok"))).toContain(
      "name must be text"
    );
    expect(ALLOWED_KEYS.size).toBe(6);
  });
});

describe("the Claude Code pack loads", () => {
  it("every agent has the front matter Claude Code needs, or it is silently skipped", () => {
    // Until 2026-09-30 none of the five had it, so none of them ever loaded.
    const agents = readdirSync(resolve(ROOT, ".claude/agents")).filter((f) => f.endsWith(".md"));
    expect(agents.length).toBeGreaterThanOrEqual(5);
    for (const f of agents) {
      const fm = frontMatter(read(`.claude/agents/${f}`));
      expect(fm, f).not.toBeNull();
      expect(fm!.name, f).toBe(f.replace(/\.md$/, ""));
      expect(fm!.description?.length, f).toBeGreaterThan(20);
    }
  });

  it("every skill has a name matching its folder and a description it will not cut", () => {
    expect(claudeCodeSkills).toEqual(
      expect.arrayContaining(["assessment-factory", "copy-gate", "jarvis-brief", "report-chapter"])
    );
    for (const d of claudeCodeSkills) {
      const fm = frontMatter(read(`.claude/skills/${d}/SKILL.md`));
      expect(fm?.name, d).toBe(d);
      expect(fm?.description, d).toBeTruthy();
      // Claude Code truncates description plus when_to_use at 1,536 characters.
      expect(fm!.description!.length, d).toBeLessThanOrEqual(1536);
    }
  });
});
