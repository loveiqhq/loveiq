---
name: report-chapter
description: Draft or revise one LoveIQ report chapter for one archetype the house way - context pack first, the chapter method, the Copy Gate until clean, and a note of how it was made. Use when editing chapter copy in data/report-*.ts or drafting a new chapter.
---

# Report chapter

A chapter is written for one archetype from a small, exact context, checked, and signed off
by a person. Jarvis (the `loveiq-brain` MCP server) supplies the context and the checks.

## Steps

1. Call `get_context_pack` with `chapter` and `archetype`. It returns only what the draft
   needs: the chapter blueprint, the theory file, approved generic text, the voice rules
   and the evidence. Do not paste in more than that; a long context makes the copy drift.
2. Read the chapter method once: `fetch_document` with id `skill/write-a-report-chapter`
   (it has several parts; read them in order).
3. Draft or revise the text in the chapter's data file (`data/report-*.ts`).
4. Run the copy-gate skill: `check_copy` with `chapter` and `archetype`, then
   `npm run voice:check`. Repeat until both are clean.
5. Write down how it was made, in the PR description under "How this was made": the model,
   the context pack (chapter and archetype), any extra sources, and what was changed by
   hand. Mark asked for this so a chapter can be reproduced (16 Sep).
6. A person reads it before it merges. Copy that has not been read by a person does not
   ship, however clean the checks are.

For non-engineers, the same flow runs in claude.ai through the `draft_chapter` prompt,
which ends in a Google Doc instead of a PR.
