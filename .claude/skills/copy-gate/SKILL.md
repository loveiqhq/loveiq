---
name: copy-gate
description: Check user-facing LoveIQ copy against the house rules before it ships (report chapters, emails, landing and paywall text, survey wording) with Jarvis's check_copy. Use whenever a change adds or edits words a customer will read.
---

# Copy gate

LoveIQ's rules for the words customers read, run as code. Jarvis's `check_copy` tool (the
`loveiq-brain` MCP server) holds them, and `npm run voice:check` checks the report
chapters against their own shipped voice.

## Steps

1. Take only the new or changed text, not the whole file.
2. Call `check_copy` with `text`. For a report chapter, also pass `chapter` and
   `archetype`: it then checks length and reading time against the shipped chapter, lines
   repeated across archetypes, and sentences lifted from another chapter.
3. Fix every MUST FIX item. Fix WORTH FIXING items too, unless the words are a quote or
   product vocabulary: "unlock" is on the machine-phrase list, and it is also our
   paywall's own word (Unlock your full report). Keep it there.
4. For a report chapter, run `npm run voice:check` as well.
5. Run `check_copy` again until it is clean, and say in the PR that it is.

## What it checks, so you can write to it first

- Plain words and short sentences. The gate flags anything above school grade 8; Mark's
  aim for report copy is lower, a reader of about eight.
- No em dash or en dash. Use a full stop, a comma or brackets.
- No machine-sounding phrases ("delve", "in essence", "deeply", "navigate", "journey").
- No absolute claims (always, never, everyone, nothing) unless they are literally true.
- Nothing that reads as a diagnosis near a score. We screen; we never diagnose.

## What it cannot check

- Do not change the orange Continue or Unlock button (colour, size or style) without
  Eman's say-so.
- A claim about research must be backed by a source. Find one with
  `search_company_context` (`sources: ["evidence"]`, then `["paper"]`), or cut the claim.
- Keep one term for one idea across chapters (libido or desire, not both at random).
- Every commit ends with a plain-English `For Marcus:` line and no AI attribution.
