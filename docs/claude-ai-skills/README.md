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

`PROJECT_INSTRUCTIONS.md` is the text for the claude.ai Project "LoveIQ", which exists since
2026-10-05 and is shared with the whole organization. After changing the file, paste its new
text into the project's instructions.

All four skills have been in the organization library since 2026-10-05, installed by default
for everyone.

## Install one

1. Build the zips: `npm run skills:pack`. It checks each skill (only the front matter
   keys claude.ai accepts, a valid name, a description it will not cut) and writes
   `dist/claude-ai-skills/<name>.zip`.
2. For everyone (an organization admin): claude.ai → **Organization settings → Plugins &
   skills → Add → Upload a skill**, and choose the zip. A skill uploaded there is installed by
   default for every member, and Claude Code sessions see it too. A name that already exists
   asks "Upload and replace": that saves a new version, and earlier versions stay in its
   history. For yourself only: **Customize → Skills → Add → Upload skill**.
3. In a chat, turn on the **loveiq-brain** connector. The skills call its tools, and do
   nothing useful without it.

## Change one

Edit its `SKILL.md` here, run `npm test` (a test checks that every Jarvis tool a skill
names exists), then `npm run skills:pack` to rebuild the zips, and upload the new one.
The zip is not rebuilt by anything else, and claude.ai keeps the old version until you do.
