# LoveIQ skills for claude.ai

Four skills that teach Claude in claude.ai how LoveIQ does four jobs, using Jarvis (the
loveiq-brain connector). They are the non-engineer half of the Jarvis pack; the Claude
Code half is `.claude/skills/` in this repo.

| Skill                   | For                                                             |
| ----------------------- | --------------------------------------------------------------- |
| `loveiq-copy-gate`      | Checking and fixing copy against the house rules                |
| `loveiq-chapter-writer` | Drafting a report chapter for one archetype, the house way      |
| `loveiq-numbers`        | KPI, funnel, revenue and cost questions, with period and source |
| `loveiq-research`       | What the published research says, with every source named       |

`PROJECT_INSTRUCTIONS.md` is the text for a claude.ai Project called "LoveIQ".

## Install one

1. Build the zips: `npm run skills:pack`. It checks each skill (only the front matter
   keys claude.ai accepts, a valid name, a description it will not cut) and writes
   `dist/claude-ai-skills/<name>.zip`.
2. In claude.ai: **Settings → Capabilities → Skills → Upload skill**, and choose the zip.
3. In a chat, turn on the **loveiq-brain** connector. The skills call its tools, and do
   nothing useful without it.

## Change one

Edit its `SKILL.md` here, run `npm test` (a test checks that every Jarvis tool a skill
names exists), then upload the new zip. claude.ai keeps the old version until you do.
