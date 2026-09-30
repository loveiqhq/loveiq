---
name: loveiq-chapter-writer
description: Draft or revise one LoveIQ report chapter for one archetype the house way - Jarvis's context pack, the chapter method, the copy checks until clean, a Google Doc for review, and a note of how it was made. Use when someone asks to write, rewrite or scale a report chapter.
---

# LoveIQ chapter writer

Needs the loveiq-brain connector (Jarvis) turned on in this chat.

## Steps

1. Confirm the chapter and the archetype (one of the 14). Ask if either is missing.
2. Call `get_context_pack` with `chapter` and `archetype`. Use only what it returns: the
   blueprint, the theory, the approved generic text, the voice rules and the evidence.
   Extra material makes the copy drift.
3. Read the chapter method: `fetch_document` with id `skill/write-a-report-chapter`, every
   part in order.
4. Draft the chapter.
5. Call `check_copy` with the draft, `chapter` and `archetype`. Fix and check again until
   there is nothing left to fix. Say what changed.
6. Show the draft and wait for a clear OK before saving anything.
7. After the OK, save it with `write_to_google_doc`, ending with a section called "How this
   was made": the model, the chapter and archetype of the context pack, any other source,
   and what a person changed.

A draft is never final until a person on the team has read it. The same flow is the
`draft_chapter` prompt in Jarvis.
